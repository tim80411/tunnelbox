import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock Electron
vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn()
  },
  BrowserWindow: {
    getAllWindows: vi.fn().mockReturnValue([])
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

// Mock settings-store
const mockGetSettings = vi.fn().mockReturnValue({
  autoStartServers: false,
  defaultServeMode: 'static',
  visitorNotifications: true,
  remoteConsoleEnabled: true
})

vi.mock('../../src/main/settings-store', () => ({
  getSettings: () => mockGetSettings()
}))

const { handleConsoleMessage, _getBuffers, _clearAll } = await import(
  '../../src/main/remote-console'
)

describe('RemoteConsole', () => {
  beforeEach(() => {
    _clearAll()
    mockGetSettings.mockReturnValue({
      autoStartServers: false,
      defaultServeMode: 'static',
      visitorNotifications: true,
      remoteConsoleEnabled: true
    })
  })

  afterEach(() => {
    _clearAll()
  })

  describe('handleConsoleMessage', () => {
    it('returns true and stores entry for valid console message', () => {
      const msg = JSON.stringify({
        type: 'console',
        level: 'log',
        args: ['hello', 42],
        timestamp: 1000,
        sessionId: 'abc123'
      })

      const result = handleConsoleMessage(msg, 'site-1')
      expect(result).toBe(true)

      const buf = _getBuffers().get('site-1')
      expect(buf).toBeDefined()
      expect(buf!.length).toBe(1)
      expect(buf![0].level).toBe('log')
      expect(buf![0].args).toEqual(['hello', 42])
      expect(buf![0].siteId).toBe('site-1')
    })

    it('returns false for non-console messages', () => {
      const msg = JSON.stringify({ type: 'reload' })
      expect(handleConsoleMessage(msg, 'site-1')).toBe(false)
    })

    it('returns false for invalid JSON', () => {
      expect(handleConsoleMessage('not json', 'site-1')).toBe(false)
    })

    it('returns false when remote console is disabled', () => {
      mockGetSettings.mockReturnValue({
        autoStartServers: false,
        defaultServeMode: 'static',
        visitorNotifications: true,
        remoteConsoleEnabled: false
      })

      const msg = JSON.stringify({
        type: 'console',
        level: 'log',
        args: ['test'],
        timestamp: 1000,
        sessionId: 'abc'
      })

      expect(handleConsoleMessage(msg, 'site-1')).toBe(false)
    })

    it('handles warn and error levels', () => {
      const warn = JSON.stringify({
        type: 'console',
        level: 'warn',
        args: ['warning'],
        timestamp: 2000,
        sessionId: 'x'
      })
      const error = JSON.stringify({
        type: 'console',
        level: 'error',
        args: ['error'],
        timestamp: 3000,
        sessionId: 'x'
      })

      expect(handleConsoleMessage(warn, 'site-1')).toBe(true)
      expect(handleConsoleMessage(error, 'site-1')).toBe(true)

      const buf = _getBuffers().get('site-1')!
      expect(buf.length).toBe(2)
      expect(buf[0].level).toBe('warn')
      expect(buf[1].level).toBe('error')
    })

    it('rejects invalid log levels', () => {
      const msg = JSON.stringify({
        type: 'console',
        level: 'debug',
        args: ['test'],
        timestamp: 1000,
        sessionId: 'abc'
      })
      expect(handleConsoleMessage(msg, 'site-1')).toBe(false)
    })

    it('enforces ring buffer limit of 500', () => {
      for (let i = 0; i < 550; i++) {
        handleConsoleMessage(
          JSON.stringify({
            type: 'console',
            level: 'log',
            args: [i],
            timestamp: i,
            sessionId: 'sess'
          }),
          'site-1'
        )
      }

      const buf = _getBuffers().get('site-1')!
      expect(buf.length).toBe(500)
      // The oldest entries (0-49) should have been dropped
      expect(buf[0].args).toEqual([50])
      expect(buf[499].args).toEqual([549])
    })

    it('normalizes args to array when not already an array', () => {
      const msg = JSON.stringify({
        type: 'console',
        level: 'log',
        args: 'single-value',
        timestamp: 1000,
        sessionId: 'abc'
      })

      handleConsoleMessage(msg, 'site-1')
      const buf = _getBuffers().get('site-1')!
      expect(buf[0].args).toEqual(['single-value'])
    })

    it('defaults timestamp and sessionId when missing', () => {
      const msg = JSON.stringify({
        type: 'console',
        level: 'log',
        args: ['test']
      })

      handleConsoleMessage(msg, 'site-1')
      const buf = _getBuffers().get('site-1')!
      expect(buf[0].timestamp).toBeTypeOf('number')
      expect(buf[0].sessionId).toBe('unknown')
    })
  })
})
