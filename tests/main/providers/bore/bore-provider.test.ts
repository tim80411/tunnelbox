import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('electron', () => ({
  app: { getPath: vi.fn().mockReturnValue('/mock/userData') },
  BrowserWindow: { getAllWindows: vi.fn().mockReturnValue([]) },
  safeStorage: {
    isEncryptionAvailable: vi.fn().mockReturnValue(true),
    encryptString: vi.fn().mockReturnValue(Buffer.from('encrypted')),
    decryptString: vi.fn().mockReturnValue('test-secret'),
  },
}))

vi.mock('../../../../src/main/providers/bore/detector', () => ({
  detectBore: vi.fn().mockResolvedValue({ status: 'available', version: '0.6.0' }),
  findBinary: vi.fn().mockResolvedValue('/usr/local/bin/bore'),
  getLocalBinaryPath: vi.fn().mockReturnValue('/mock/userData/bin/bore'),
}))

vi.mock('../../../../src/main/providers/bore/installer', () => ({
  installBore: vi.fn().mockResolvedValue('/mock/userData/bin/bore'),
}))

vi.mock('../../../../src/main/providers/bore/bore-config-store', () => ({
  getBoreConfig: vi.fn().mockReturnValue({
    serverAddr: 'my-vps.example.com',
    serverPort: 7835,
    secret: 'test-secret',
  }),
  saveBoreConfig: vi.fn(),
  clearBoreConfig: vi.fn(),
}))

import { BoreProvider } from '../../../../src/main/providers/bore/bore-provider'
import { detectBore } from '../../../../src/main/providers/bore/detector'
import { installBore } from '../../../../src/main/providers/bore/installer'
import { EventEmitter } from 'node:events'

function createMockProcessManager() {
  const pm = new EventEmitter() as any
  pm.spawn = vi.fn()
  pm.kill = vi.fn()
  return pm
}

describe('BoreProvider', () => {
  let provider: BoreProvider
  let mockPm: ReturnType<typeof createMockProcessManager>

  beforeEach(() => {
    vi.clearAllMocks()
    mockPm = createMockProcessManager()
    provider = new BoreProvider(mockPm)
  })

  it('has type "bore"', () => {
    expect(provider.type).toBe('bore')
  })

  it('detect() delegates to detectBore', async () => {
    const env = await provider.detect()
    expect(detectBore).toHaveBeenCalled()
    expect(env.status).toBe('available')
  })

  it('install() delegates to installBore', async () => {
    await provider.install()
    expect(installBore).toHaveBeenCalled()
  })

  it('login() returns not_required', async () => {
    const auth = await provider.login()
    expect(auth.status).toBe('not_required')
  })

  it('getAuthStatus() returns not_required', () => {
    const auth = provider.getAuthStatus()
    expect(auth.status).toBe('not_required')
  })

  it('startTunnel spawns bore with correct args', async () => {
    const tunnelPromise = provider.startTunnel('site1', 3000)

    // Simulate bore output after a tick
    setTimeout(() => {
      mockPm.emit('stdout', 'bore-site1', 'listening at my-vps.example.com:54321')
    }, 50)

    const url = await tunnelPromise
    expect(url).toBe('http://my-vps.example.com:54321')
    expect(mockPm.spawn).toHaveBeenCalledWith(
      'bore-site1',
      '/usr/local/bin/bore',
      ['local', '3000', '--to', 'my-vps.example.com:7835', '--secret', 'test-secret']
    )
  })

  it('startTunnel sets tunnel info to running', async () => {
    const tunnelPromise = provider.startTunnel('site1', 3000)
    setTimeout(() => {
      mockPm.emit('stdout', 'bore-site1', 'listening at my-vps.example.com:54321')
    }, 50)
    await tunnelPromise

    const info = provider.getTunnelInfo('site1')
    expect(info).toBeDefined()
    expect(info!.status).toBe('running')
    expect(info!.providerType).toBe('bore')
    expect(info!.publicUrl).toBe('http://my-vps.example.com:54321')
  })

  it('stopTunnel kills process and clears state', async () => {
    const tunnelPromise = provider.startTunnel('site1', 3000)
    setTimeout(() => {
      mockPm.emit('stdout', 'bore-site1', 'listening at my-vps.example.com:54321')
    }, 50)
    await tunnelPromise

    await provider.stopTunnel('site1')
    expect(mockPm.kill).toHaveBeenCalledWith('bore-site1')
    expect(provider.getTunnelInfo('site1')).toBeUndefined()
  })

  it('stopAll stops all tunnels', async () => {
    const p1 = provider.startTunnel('site1', 3000)
    const p2 = provider.startTunnel('site2', 4000)
    setTimeout(() => {
      mockPm.emit('stdout', 'bore-site1', 'listening at my-vps.example.com:11111')
      mockPm.emit('stdout', 'bore-site2', 'listening at my-vps.example.com:22222')
    }, 50)
    await Promise.all([p1, p2])

    await provider.stopAll()
    expect(provider.getTunnelInfo('site1')).toBeUndefined()
    expect(provider.getTunnelInfo('site2')).toBeUndefined()
  })

  it('restoreAll is a no-op', async () => {
    await provider.restoreAll(() => null)
    // Should not throw
  })

  it('getTunnelInfo returns undefined for unknown site', () => {
    expect(provider.getTunnelInfo('unknown')).toBeUndefined()
  })
})
