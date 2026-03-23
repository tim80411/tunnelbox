import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('node:child_process', () => ({
  execFile: vi.fn()
}))

vi.mock('node:fs', () => ({
  default: { existsSync: vi.fn().mockReturnValue(false) },
  existsSync: vi.fn().mockReturnValue(false)
}))

import { findBinary, detectBinary, type BinaryDetectorConfig } from '../../../../src/main/providers/shared/binary-detector'
import { execFile } from 'node:child_process'
import fs from 'node:fs'

const testConfig: BinaryDetectorConfig = {
  name: 'testbin',
  minVersion: '1.0.0',
  localBinaryPath: '/tmp/test/bin/testbin',
  wellKnownPaths: ['/usr/local/bin/testbin'],
  versionArgs: ['--version'],
  versionRegex: /(\d+\.\d+\.\d+)/
}

describe('findBinary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns local path when it exists', async () => {
    vi.mocked(fs.existsSync).mockImplementation((p) => p === testConfig.localBinaryPath)
    const result = await findBinary(testConfig)
    expect(result).toBe(testConfig.localBinaryPath)
  })

  it('returns well-known path when local not found', async () => {
    vi.mocked(fs.existsSync).mockImplementation((p) => p === '/usr/local/bin/testbin')
    const result = await findBinary(testConfig)
    expect(result).toBe('/usr/local/bin/testbin')
  })

  it('returns null when binary not found anywhere', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false)
    vi.mocked(execFile).mockImplementation((_cmd, _args, _opts, cb) => {
      (cb as Function)(new Error('not found'), '', '')
      return {} as ReturnType<typeof execFile>
    })
    const result = await findBinary(testConfig)
    expect(result).toBeNull()
  })
})

describe('detectBinary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns not_installed when binary not found', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false)
    vi.mocked(execFile).mockImplementation((_cmd, _args, _opts, cb) => {
      (cb as Function)(new Error('not found'), '', '')
      return {} as ReturnType<typeof execFile>
    })
    const env = await detectBinary(testConfig)
    expect(env.status).toBe('not_installed')
  })

  it('returns available with version when binary is found and version meets minimum', async () => {
    vi.mocked(fs.existsSync).mockImplementation((p) => p === testConfig.localBinaryPath)
    vi.mocked(execFile).mockImplementation((_cmd, _args, _opts, cb) => {
      (cb as Function)(null, 'testbin version 2.0.0', '')
      return {} as ReturnType<typeof execFile>
    })
    const env = await detectBinary(testConfig)
    expect(env.status).toBe('available')
    expect(env.version).toBe('2.0.0')
  })

  it('returns outdated when version is below minimum', async () => {
    vi.mocked(fs.existsSync).mockImplementation((p) => p === testConfig.localBinaryPath)
    vi.mocked(execFile).mockImplementation((_cmd, _args, _opts, cb) => {
      (cb as Function)(null, 'testbin version 0.5.0', '')
      return {} as ReturnType<typeof execFile>
    })
    const env = await detectBinary(testConfig)
    expect(env.status).toBe('outdated')
    expect(env.version).toBe('0.5.0')
  })

  it('returns error when version cannot be parsed', async () => {
    vi.mocked(fs.existsSync).mockImplementation((p) => p === testConfig.localBinaryPath)
    vi.mocked(execFile).mockImplementation((_cmd, _args, _opts, cb) => {
      (cb as Function)(null, 'no version info', '')
      return {} as ReturnType<typeof execFile>
    })
    const env = await detectBinary(testConfig)
    expect(env.status).toBe('error')
    expect(env.errorMessage).toContain('testbin')
  })
})
