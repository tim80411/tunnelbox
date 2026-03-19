import { describe, it, expect, vi, beforeEach } from 'vitest'
import { siteAdd, siteList, siteRemove } from '@/cli/commands/site'
import { CLIError } from '@/cli/errors'
import type { IStore } from '@/core/store-interface'
import type { StoredSite } from '@/shared/types'

function createMockStore(sites: StoredSite[] = []): IStore {
  const data = { sites: [...sites] }
  return {
    getSites: vi.fn(() => data.sites),
    saveSites: vi.fn((s: StoredSite[]) => { data.sites = s }),
    addSite: vi.fn((site: StoredSite) => { data.sites.push(site) }),
    removeSite: vi.fn((id: string) => { data.sites = data.sites.filter(s => s.id !== id) }),
    getAuth: vi.fn(() => null),
    saveAuth: vi.fn(),
    clearAuth: vi.fn(),
    getTunnels: vi.fn(() => []),
    saveTunnel: vi.fn(),
    removeTunnel: vi.fn(),
    getDomainBinding: vi.fn(() => null),
    saveDomainBinding: vi.fn(),
    removeDomainBinding: vi.fn(),
  }
}

describe('siteAdd', () => {
  it('adds a site successfully', () => {
    const store = createMockStore()
    const result = siteAdd(store, 'my-site', '/tmp')

    expect(result.name).toBe('my-site')
    expect(result.folderPath).toBe('/tmp')
    expect(result.id).toBeDefined()
    expect(store.addSite).toHaveBeenCalledWith(result)
  })

  it('resolves relative folder path', () => {
    const store = createMockStore()
    const result = siteAdd(store, 'my-site', '.')

    expect(result.folderPath).toBe(process.cwd())
  })

  it('throws CLIError exit 1 when folder not found', () => {
    const store = createMockStore()

    expect(() => siteAdd(store, 'my-site', '/nonexistent/path/xyz'))
      .toThrow(CLIError)

    try {
      siteAdd(store, 'my-site', '/nonexistent/path/xyz')
    } catch (err) {
      expect((err as CLIError).exitCode).toBe(1)
      expect((err as CLIError).message).toContain('Folder not found')
    }
  })

  it('throws CLIError exit 1 when name is duplicate', () => {
    const existing: StoredSite = { id: 'id-1', name: 'my-site', folderPath: '/tmp' }
    const store = createMockStore([existing])

    expect(() => siteAdd(store, 'my-site', '/tmp'))
      .toThrow(CLIError)

    try {
      siteAdd(store, 'my-site', '/tmp')
    } catch (err) {
      expect((err as CLIError).exitCode).toBe(1)
      expect((err as CLIError).message).toContain('already exists')
    }
  })
})

describe('siteList', () => {
  it('returns all sites', () => {
    const sites: StoredSite[] = [
      { id: 'id-1', name: 'site-a', folderPath: '/a' },
      { id: 'id-2', name: 'site-b', folderPath: '/b' },
    ]
    const store = createMockStore(sites)

    const result = siteList(store)
    expect(result).toEqual(sites)
  })

  it('returns empty array when no sites', () => {
    const store = createMockStore()

    const result = siteList(store)
    expect(result).toEqual([])
  })
})

describe('siteRemove', () => {
  it('removes a site by name', () => {
    const sites: StoredSite[] = [
      { id: 'id-1', name: 'my-site', folderPath: '/a' },
      { id: 'id-2', name: 'other', folderPath: '/b' },
    ]
    const store = createMockStore(sites)

    const result = siteRemove(store, 'my-site')
    expect(result.id).toBe('id-1')
    expect(result.name).toBe('my-site')
    expect(store.removeSite).toHaveBeenCalledWith('id-1')
  })

  it('removes a site by id', () => {
    const sites: StoredSite[] = [
      { id: 'id-1', name: 'my-site', folderPath: '/a' },
    ]
    const store = createMockStore(sites)

    const result = siteRemove(store, 'id-1')
    expect(result.id).toBe('id-1')
    expect(store.removeSite).toHaveBeenCalledWith('id-1')
  })

  it('throws CLIError exit 1 when site not found', () => {
    const store = createMockStore()

    expect(() => siteRemove(store, 'ghost'))
      .toThrow(CLIError)

    try {
      siteRemove(store, 'ghost')
    } catch (err) {
      expect((err as CLIError).exitCode).toBe(1)
      expect((err as CLIError).message).toContain('Site not found')
    }
  })
})
