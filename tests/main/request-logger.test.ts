import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { RequestLogEntry } from '../../src/shared/types'

// Mock electron
const mockSend = vi.fn()
const mockGetAllWindows = vi.fn().mockReturnValue([
  { webContents: { send: mockSend } }
])

const mockHandle = vi.fn()
const mockRemoveHandler = vi.fn()

vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: () => mockGetAllWindows()
  },
  ipcMain: {
    handle: (...args: unknown[]) => mockHandle(...args),
    removeHandler: (...args: unknown[]) => mockRemoveHandler(...args)
  }
}))

// Mock logger
vi.mock('../../src/main/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  })
}))

// Import after mocks
const { initRequestLogger, stopRequestLogger, addEntry, clearEntries, _getEntries, _reset } = await import(
  '../../src/main/request-logger'
)

function makeEntry(overrides: Partial<Omit<RequestLogEntry, 'id'>> = {}): Omit<RequestLogEntry, 'id'> {
  return {
    siteId: 'site-1',
    timestamp: Date.now(),
    method: 'GET',
    path: '/api/test',
    statusCode: 200,
    duration: 42,
    requestHeaders: { 'content-type': 'application/json' },
    responseHeaders: { 'content-type': 'application/json' },
    requestBody: null,
    requestBodySize: 0,
    requestBodyTruncated: false,
    ...overrides
  }
}

describe('RequestLogger', () => {
  beforeEach(() => {
    _reset()
    mockSend.mockClear()
    mockHandle.mockClear()
    mockRemoveHandler.mockClear()
    mockGetAllWindows.mockReturnValue([
      { webContents: { send: mockSend } }
    ])
    initRequestLogger()
  })

  afterEach(() => {
    _reset()
  })

  it('stores entry and broadcasts to renderer', () => {
    addEntry(makeEntry())
    const entries = _getEntries('site-1')
    expect(entries).toHaveLength(1)
    expect(entries[0].method).toBe('GET')
    expect(entries[0].path).toBe('/api/test')
    expect(entries[0].siteId).toBe('site-1')
    expect(entries[0].id).toBeDefined()

    expect(mockSend).toHaveBeenCalledWith(
      'request-log:new',
      expect.objectContaining({
        method: 'GET',
        path: '/api/test',
        siteId: 'site-1'
      })
    )
  })

  it('enforces per-site max entries (default 200)', () => {
    for (let i = 0; i < 210; i++) {
      addEntry(makeEntry({ timestamp: i }))
    }
    const entries = _getEntries('site-1')
    expect(entries).toHaveLength(200)
    // oldest entries should have been trimmed; the remaining entries start at timestamp 10
    expect(entries[0].timestamp).toBe(10)
  })

  it('clears entries for specific site', () => {
    addEntry(makeEntry({ siteId: 'site-1' }))
    addEntry(makeEntry({ siteId: 'site-2' }))
    expect(_getEntries('site-1')).toHaveLength(1)
    expect(_getEntries('site-2')).toHaveLength(1)

    clearEntries('site-1')
    expect(_getEntries('site-1')).toHaveLength(0)
    expect(_getEntries('site-2')).toHaveLength(1)
  })

  it('registers IPC handlers on init', () => {
    const channels = mockHandle.mock.calls.map((call) => call[0])
    expect(channels).toContain('request-log:get')
    expect(channels).toContain('request-log:clear')
  })

  it('get handler returns entries newest first', () => {
    addEntry(makeEntry({ timestamp: 1000, path: '/first' }))
    addEntry(makeEntry({ timestamp: 2000, path: '/second' }))

    const getHandler = mockHandle.mock.calls.find((c) => c[0] === 'request-log:get')
    expect(getHandler).toBeDefined()
    const result: RequestLogEntry[] = getHandler![1]({}, 'site-1')
    expect(result).toHaveLength(2)
    expect(result[0].path).toBe('/second')
    expect(result[1].path).toBe('/first')
  })

  it('does not duplicate handlers on multiple init calls', () => {
    const handleCountBefore = mockHandle.mock.calls.length
    // Second init should be a no-op
    initRequestLogger()
    expect(mockHandle.mock.calls.length).toBe(handleCountBefore)
  })
})
