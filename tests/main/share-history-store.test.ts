import { describe, it, expect, vi, beforeEach } from 'vitest'
import fs from 'node:fs'

// In-memory store to simulate electron-store — use vi.hoisted so the mock can access it
const storeState = vi.hoisted(() => ({ data: {} as Record<string, unknown> }))

vi.mock('electron-store', () => {
  return {
    default: class MockStore {
      private defaults: Record<string, unknown>

      constructor(opts?: { defaults?: Record<string, unknown> }) {
        this.defaults = opts?.defaults ?? {}
        // Initialize store with defaults if empty
        for (const [key, value] of Object.entries(this.defaults)) {
          if (!(key in storeState.data)) {
            storeState.data[key] = JSON.parse(JSON.stringify(value))
          }
        }
      }

      get(key: string): unknown {
        if (key in storeState.data) return storeState.data[key]
        return this.defaults[key]
      }

      set(key: string, value: unknown): void {
        storeState.data[key] = value
      }
    }
  }
})

// Mock electron app module (needed by logger.ts)
vi.mock('electron', () => ({
  app: { isPackaged: false }
}))

import {
  startRecord,
  endRecord,
  getRecords,
  markAbnormalEnds,
  exportToCsv
} from '../../src/main/share-history-store'

describe('share-history-store', () => {
  beforeEach(() => {
    // Reset the in-memory store before each test
    storeState.data = { records: [] }
  })

  describe('startRecord', () => {
    it('creates a new record with correct fields', () => {
      const record = startRecord(
        { id: 'site-1', name: 'My Site', sitePath: '/path/to/site' },
        'https://abc.trycloudflare.com',
        'cloudflare'
      )

      expect(record.id).toBeDefined()
      expect(record.siteId).toBe('site-1')
      expect(record.siteName).toBe('My Site')
      expect(record.sitePath).toBe('/path/to/site')
      expect(record.tunnelUrl).toBe('https://abc.trycloudflare.com')
      expect(record.providerType).toBe('cloudflare')
      expect(record.startedAt).toBeDefined()
      expect(record.endedAt).toBeNull()
      expect(record.abnormalEnd).toBe(false)
    })

    it('persists the record in the store', () => {
      startRecord(
        { id: 'site-1', name: 'My Site', sitePath: '/path' },
        'https://url.com',
        'cloudflare'
      )

      const records = getRecords()
      expect(records).toHaveLength(1)
      expect(records[0].siteId).toBe('site-1')
    })

    it('can create multiple records', () => {
      startRecord({ id: 'site-1', name: 'Site A', sitePath: '/a' }, 'https://a.com', 'cloudflare')
      startRecord({ id: 'site-2', name: 'Site B', sitePath: '/b' }, 'https://b.com', 'frp')

      const records = getRecords()
      expect(records).toHaveLength(2)
    })
  })

  describe('endRecord', () => {
    it('sets endedAt on the latest in-progress record for the given siteId', () => {
      startRecord({ id: 'site-1', name: 'My Site', sitePath: '/path' }, 'https://url.com', 'cloudflare')

      endRecord('site-1')

      const records = getRecords()
      expect(records[0].endedAt).not.toBeNull()
      expect(records[0].abnormalEnd).toBe(false)
    })

    it('does not modify records for other sites', () => {
      startRecord({ id: 'site-1', name: 'Site A', sitePath: '/a' }, 'https://a.com', 'cloudflare')
      startRecord({ id: 'site-2', name: 'Site B', sitePath: '/b' }, 'https://b.com', 'frp')

      endRecord('site-1')

      const records = getRecords()
      const site1Record = records.find((r) => r.siteId === 'site-1')
      const site2Record = records.find((r) => r.siteId === 'site-2')

      expect(site1Record?.endedAt).not.toBeNull()
      expect(site2Record?.endedAt).toBeNull()
    })

    it('does nothing if no in-progress record exists for the siteId', () => {
      // Start and end a record
      startRecord({ id: 'site-1', name: 'My Site', sitePath: '/path' }, 'https://url.com', 'cloudflare')
      endRecord('site-1')

      const before = getRecords()

      // End again (should be a no-op)
      endRecord('site-1')

      const after = getRecords()
      expect(after[0].endedAt).toBe(before[0].endedAt)
    })

    it('ends only the latest in-progress record when multiple exist', () => {
      // Start two records for the same site
      startRecord({ id: 'site-1', name: 'My Site', sitePath: '/path' }, 'https://url1.com', 'cloudflare')
      startRecord({ id: 'site-1', name: 'My Site', sitePath: '/path' }, 'https://url2.com', 'cloudflare')

      endRecord('site-1')

      const records = getRecords()
      const inProgress = records.filter((r) => r.endedAt === null)
      const ended = records.filter((r) => r.endedAt !== null)

      expect(inProgress).toHaveLength(1)
      expect(ended).toHaveLength(1)
      expect(ended[0].tunnelUrl).toBe('https://url2.com')
    })
  })

  describe('getRecords', () => {
    it('returns empty array when no records exist', () => {
      expect(getRecords()).toEqual([])
    })

    it('returns records sorted by startedAt descending', () => {
      // Manually set records with different timestamps
      const now = Date.now()
      storeState.data.records = [
        {
          id: '1', siteId: 's1', siteName: 'A', sitePath: '/a', tunnelUrl: 'https://a.com',
          providerType: 'cloudflare', startedAt: new Date(now - 2000).toISOString(),
          endedAt: new Date(now - 1000).toISOString(), abnormalEnd: false
        },
        {
          id: '2', siteId: 's2', siteName: 'B', sitePath: '/b', tunnelUrl: 'https://b.com',
          providerType: 'frp', startedAt: new Date(now - 1000).toISOString(),
          endedAt: new Date(now).toISOString(), abnormalEnd: false
        }
      ]

      const records = getRecords()
      expect(records[0].id).toBe('2')
      expect(records[1].id).toBe('1')
    })

    it('puts in-progress records before ended records', () => {
      const now = Date.now()
      storeState.data.records = [
        {
          id: '1', siteId: 's1', siteName: 'Old ended', sitePath: '/a', tunnelUrl: 'https://a.com',
          providerType: 'cloudflare', startedAt: new Date(now).toISOString(),
          endedAt: new Date(now + 1000).toISOString(), abnormalEnd: false
        },
        {
          id: '2', siteId: 's2', siteName: 'In progress', sitePath: '/b', tunnelUrl: 'https://b.com',
          providerType: 'frp', startedAt: new Date(now - 5000).toISOString(),
          endedAt: null, abnormalEnd: false
        }
      ]

      const records = getRecords()
      expect(records[0].id).toBe('2') // in-progress first
      expect(records[1].id).toBe('1')
    })
  })

  describe('markAbnormalEnds', () => {
    it('marks all in-progress records as abnormally ended', () => {
      storeState.data.records = [
        {
          id: '1', siteId: 's1', siteName: 'A', sitePath: '/a', tunnelUrl: 'https://a.com',
          providerType: 'cloudflare', startedAt: new Date().toISOString(),
          endedAt: null, abnormalEnd: false
        },
        {
          id: '2', siteId: 's2', siteName: 'B', sitePath: '/b', tunnelUrl: 'https://b.com',
          providerType: 'frp', startedAt: new Date().toISOString(),
          endedAt: null, abnormalEnd: false
        }
      ]

      markAbnormalEnds()

      const records = getRecords()
      expect(records).toHaveLength(2)
      for (const record of records) {
        expect(record.endedAt).not.toBeNull()
        expect(record.abnormalEnd).toBe(true)
      }
    })

    it('does not affect already-ended records', () => {
      const endedAt = new Date().toISOString()
      storeState.data.records = [
        {
          id: '1', siteId: 's1', siteName: 'A', sitePath: '/a', tunnelUrl: 'https://a.com',
          providerType: 'cloudflare', startedAt: new Date().toISOString(),
          endedAt, abnormalEnd: false
        }
      ]

      markAbnormalEnds()

      const records = getRecords()
      expect(records[0].endedAt).toBe(endedAt)
      expect(records[0].abnormalEnd).toBe(false)
    })

    it('does nothing when no in-progress records exist', () => {
      storeState.data.records = []
      markAbnormalEnds()
      expect(getRecords()).toEqual([])
    })
  })

  describe('data corruption handling', () => {
    it('returns empty array when records is not an array', () => {
      storeState.data.records = 'corrupted'
      expect(getRecords()).toEqual([])
    })

    it('resets store when records is not an array', () => {
      storeState.data.records = { bad: true }
      getRecords()
      expect(storeState.data.records).toEqual([])
    })
  })

  describe('exportToCsv', () => {
    it('writes CSV with correct headers and data', () => {
      const now = new Date('2026-03-27T12:30:00Z')
      const end = new Date('2026-03-27T13:30:00Z')

      storeState.data.records = [
        {
          id: '1', siteId: 's1', siteName: 'My Site', sitePath: '/Users/test/site',
          tunnelUrl: 'https://abc.trycloudflare.com', providerType: 'cloudflare',
          startedAt: now.toISOString(), endedAt: end.toISOString(), abnormalEnd: false
        }
      ]

      const tmpPath = `/tmp/test-export-${Date.now()}.csv`
      exportToCsv(tmpPath)

      const content = fs.readFileSync(tmpPath, 'utf-8')
      const lines = content.split('\n')

      expect(lines[0]).toBe('Site Name,Site Path,Tunnel URL,Started At,Ended At,Provider,Status')
      expect(lines[1]).toContain('My Site')
      expect(lines[1]).toContain('/Users/test/site')
      expect(lines[1]).toContain('https://abc.trycloudflare.com')
      expect(lines[1]).toContain('cloudflare')
      expect(lines[1]).toContain('Completed')

      // Clean up
      fs.unlinkSync(tmpPath)
    })

    it('handles in-progress records in CSV', () => {
      storeState.data.records = [
        {
          id: '1', siteId: 's1', siteName: 'Active', sitePath: '/path',
          tunnelUrl: 'https://active.com', providerType: 'frp',
          startedAt: new Date().toISOString(), endedAt: null, abnormalEnd: false
        }
      ]

      const tmpPath = `/tmp/test-export-active-${Date.now()}.csv`
      exportToCsv(tmpPath)

      const content = fs.readFileSync(tmpPath, 'utf-8')
      expect(content).toContain('In Progress')

      fs.unlinkSync(tmpPath)
    })

    it('handles abnormal end records in CSV', () => {
      storeState.data.records = [
        {
          id: '1', siteId: 's1', siteName: 'Crashed', sitePath: '/path',
          tunnelUrl: 'https://crashed.com', providerType: 'bore',
          startedAt: new Date().toISOString(), endedAt: new Date().toISOString(),
          abnormalEnd: true
        }
      ]

      const tmpPath = `/tmp/test-export-abnormal-${Date.now()}.csv`
      exportToCsv(tmpPath)

      const content = fs.readFileSync(tmpPath, 'utf-8')
      expect(content).toContain('Abnormal End')

      fs.unlinkSync(tmpPath)
    })

    it('properly escapes CSV values containing commas', () => {
      storeState.data.records = [
        {
          id: '1', siteId: 's1', siteName: 'Site, with comma', sitePath: '/path',
          tunnelUrl: 'https://url.com', providerType: 'cloudflare',
          startedAt: new Date().toISOString(), endedAt: new Date().toISOString(),
          abnormalEnd: false
        }
      ]

      const tmpPath = `/tmp/test-export-escape-${Date.now()}.csv`
      exportToCsv(tmpPath)

      const content = fs.readFileSync(tmpPath, 'utf-8')
      expect(content).toContain('"Site, with comma"')

      fs.unlinkSync(tmpPath)
    })

    it('throws when file cannot be written', () => {
      storeState.data.records = [
        {
          id: '1', siteId: 's1', siteName: 'Test', sitePath: '/path',
          tunnelUrl: 'https://url.com', providerType: 'cloudflare',
          startedAt: new Date().toISOString(), endedAt: null, abnormalEnd: false
        }
      ]

      expect(() => exportToCsv('/nonexistent/dir/file.csv')).toThrow()
    })
  })
})
