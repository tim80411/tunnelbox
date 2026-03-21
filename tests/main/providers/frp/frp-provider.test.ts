import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock electron
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn().mockReturnValue('/mock/userData'),
  },
  BrowserWindow: {
    getAllWindows: vi.fn().mockReturnValue([]),
  },
  safeStorage: {
    isEncryptionAvailable: vi.fn().mockReturnValue(true),
    encryptString: vi.fn().mockReturnValue(Buffer.from('encrypted')),
    decryptString: vi.fn().mockReturnValue('test-token'),
  },
}))

// Mock detector
vi.mock('../../../../src/main/providers/frp/detector', () => ({
  detectFrpc: vi.fn().mockResolvedValue({ status: 'available', version: '0.58.1' }),
  findBinary: vi.fn().mockResolvedValue('/usr/local/bin/frpc'),
  getLocalBinaryPath: vi.fn().mockReturnValue('/mock/userData/bin/frpc'),
}))

// Mock installer
vi.mock('../../../../src/main/providers/frp/installer', () => ({
  installFrpc: vi.fn().mockResolvedValue('/mock/userData/bin/frpc'),
}))

// Mock config store
vi.mock('../../../../src/main/providers/frp/frp-config-store', () => ({
  getFrpConfig: vi.fn().mockReturnValue({
    serverAddr: 'my-vps.example.com',
    serverPort: 7000,
    authToken: 'test-token',
  }),
  saveFrpConfig: vi.fn(),
  clearFrpConfig: vi.fn(),
}))

// Mock fs
vi.mock('node:fs', () => ({
  default: {
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    unlinkSync: vi.fn(),
    existsSync: vi.fn().mockReturnValue(false),
  },
}))

import { FrpProvider } from '../../../../src/main/providers/frp/frp-provider'
import { detectFrpc } from '../../../../src/main/providers/frp/detector'
import { installFrpc } from '../../../../src/main/providers/frp/installer'
import { EventEmitter } from 'node:events'

// Create a mock ProcessManager
function createMockProcessManager() {
  const pm = new EventEmitter() as any
  pm.spawn = vi.fn().mockReturnValue({
    pid: 12345,
    exitCode: null,
    killed: false,
    kill: vi.fn(),
    stdout: new EventEmitter(),
    stderr: new EventEmitter(),
  })
  pm.kill = vi.fn()
  pm.isRunning = vi.fn().mockReturnValue(false)
  pm.removeListener = vi.fn()
  return pm
}

describe('FrpProvider', () => {
  let provider: FrpProvider
  let mockPm: ReturnType<typeof createMockProcessManager>

  beforeEach(() => {
    vi.clearAllMocks()
    mockPm = createMockProcessManager()
    provider = new FrpProvider(mockPm)
  })

  it('has type "frp"', () => {
    expect(provider.type).toBe('frp')
  })

  it('detect() delegates to detectFrpc', async () => {
    const env = await provider.detect()
    expect(detectFrpc).toHaveBeenCalled()
    expect(env.status).toBe('available')
  })

  it('install() delegates to installFrpc', async () => {
    await provider.install()
    expect(installFrpc).toHaveBeenCalled()
  })

  it('login() returns not_required', async () => {
    const auth = await provider.login()
    expect(auth.status).toBe('not_required')
  })

  it('logout() is a no-op', async () => {
    await expect(provider.logout()).resolves.toBeUndefined()
  })

  it('getAuthStatus() returns not_required', () => {
    const auth = provider.getAuthStatus()
    expect(auth.status).toBe('not_required')
  })

  it('startTunnel spawns frpc process', async () => {
    // Simulate frpc outputting success after spawn
    const startPromise = provider.startTunnel('site1', 3000)

    // Simulate stdout event with URL discovery
    setTimeout(() => {
      mockPm.emit('stdout', 'frp-site1', 'start proxy success, remote addr :12345')
    }, 50)

    const url = await startPromise
    expect(mockPm.spawn).toHaveBeenCalled()
    expect(url).toBe('http://my-vps.example.com:12345')
  })

  it('stopTunnel kills the process and cleans up', async () => {
    // First start a tunnel
    const startPromise = provider.startTunnel('site1', 3000)
    setTimeout(() => {
      mockPm.emit('stdout', 'frp-site1', 'start proxy success, remote addr :12345')
    }, 50)
    await startPromise

    await provider.stopTunnel('site1')
    expect(mockPm.kill).toHaveBeenCalledWith('frp-site1')
    expect(provider.getTunnelInfo('site1')).toBeUndefined()
  })

  it('getTunnelInfo returns undefined for unknown site', () => {
    expect(provider.getTunnelInfo('unknown')).toBeUndefined()
  })

  it('restoreAll is a no-op for frp', async () => {
    const getSitePort = vi.fn()
    await expect(provider.restoreAll(getSitePort)).resolves.toBeUndefined()
    expect(getSitePort).not.toHaveBeenCalled()
  })

  it('stopAll stops all active tunnels', async () => {
    // Start two tunnels
    const start1 = provider.startTunnel('site1', 3000)
    setTimeout(() => mockPm.emit('stdout', 'frp-site1', 'start proxy success, remote addr :11111'), 50)
    await start1

    const start2 = provider.startTunnel('site2', 3001)
    setTimeout(() => mockPm.emit('stdout', 'frp-site2', 'start proxy success, remote addr :22222'), 50)
    await start2

    await provider.stopAll()
    expect(mockPm.kill).toHaveBeenCalledWith('frp-site1')
    expect(mockPm.kill).toHaveBeenCalledWith('frp-site2')
  })
})
