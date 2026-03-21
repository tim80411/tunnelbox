import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock electron app
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn().mockReturnValue('/mock/userData'),
  },
}))

// Mock node modules
vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}))

vi.mock('node:fs', () => ({
  default: {
    existsSync: vi.fn().mockReturnValue(false),
  },
}))

import { execFile } from 'node:child_process'
import fs from 'node:fs'
import { detectFrpc, getLocalBinaryPath, findBinary } from '../../../../src/main/providers/frp/detector'

describe('frp detector', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getLocalBinaryPath', () => {
    it('returns path under userData/bin', () => {
      const result = getLocalBinaryPath()
      expect(result).toContain('bin')
      expect(result).toContain('frpc')
    })
  })

  describe('findBinary', () => {
    it('returns null when frpc is not found anywhere', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false)
      vi.mocked(execFile).mockImplementation((_cmd, _args, _opts, callback) => {
        (callback as Function)(new Error('not found'), '', '')
        return {} as any
      })

      const result = await findBinary()
      expect(result).toBeNull()
    })

    it('returns local path when local binary exists', async () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        return String(p).includes('userData')
      })

      const result = await findBinary()
      expect(result).not.toBeNull()
      expect(result).toContain('frpc')
    })
  })

  describe('detectFrpc', () => {
    it('returns not_installed when binary is not found', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false)
      vi.mocked(execFile).mockImplementation((_cmd, _args, _opts, callback) => {
        (callback as Function)(new Error('not found'), '', '')
        return {} as any
      })

      const result = await detectFrpc()
      expect(result.status).toBe('not_installed')
    })

    it('returns available with version when binary is found and version is valid', async () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        return String(p).includes('userData')
      })
      // First call is findBinary's which, second is version check
      vi.mocked(execFile).mockImplementation((_cmd, _args, _opts, callback) => {
        (callback as Function)(null, 'frpc version 0.58.1', '')
        return {} as any
      })

      const result = await detectFrpc()
      expect(result.status).toBe('available')
      expect(result.version).toBe('0.58.1')
    })

    it('returns outdated when version is too old', async () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        return String(p).includes('userData')
      })
      vi.mocked(execFile).mockImplementation((_cmd, _args, _opts, callback) => {
        (callback as Function)(null, 'frpc version 0.40.0', '')
        return {} as any
      })

      const result = await detectFrpc()
      expect(result.status).toBe('outdated')
      expect(result.version).toBe('0.40.0')
    })

    it('returns error when version cannot be parsed', async () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        return String(p).includes('userData')
      })
      vi.mocked(execFile).mockImplementation((_cmd, _args, _opts, callback) => {
        (callback as Function)(null, 'unknown output', '')
        return {} as any
      })

      const result = await detectFrpc()
      expect(result.status).toBe('error')
      expect(result.errorMessage).toContain('無法解析')
    })
  })
})
