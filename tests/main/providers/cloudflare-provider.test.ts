import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock all cloudflared modules BEFORE importing CloudflareProvider
vi.mock('../../../src/main/cloudflared', () => ({
  detectCloudflared: vi.fn().mockResolvedValue({ status: 'available', version: '2024.6.1' }),
  installCloudflared: vi.fn().mockResolvedValue('/path/to/cloudflared'),
  initQuickTunnel: vi.fn(),
  initNamedTunnel: vi.fn(),
  startQuickTunnel: vi.fn().mockResolvedValue('https://test.trycloudflare.com'),
  stopQuickTunnel: vi.fn(),
  getTunnelInfo: vi.fn().mockReturnValue(undefined),
  hasTunnel: vi.fn().mockReturnValue(false),
  startNamedTunnel: vi.fn().mockResolvedValue(undefined),
  stopNamedTunnel: vi.fn(),
  getNamedTunnelInfo: vi.fn().mockReturnValue(undefined),
  stopAllQuickTunnels: vi.fn(),
  stopAllNamedTunnels: vi.fn(),
  restoreNamedTunnels: vi.fn().mockResolvedValue(undefined),
  loginCloudflare: vi.fn().mockResolvedValue({ status: 'logged_in' }),
  logoutCloudflare: vi.fn(),
  getAuthStatus: vi.fn().mockReturnValue({ status: 'logged_out' }),
  bindFixedDomain: vi.fn().mockResolvedValue('https://my.domain.com'),
  unbindFixedDomain: vi.fn().mockResolvedValue(undefined),
  ProcessManager: vi.fn(),
}))

import { CloudflareProvider } from '../../../src/main/providers/cloudflare-provider'
import {
  startQuickTunnel,
  stopQuickTunnel,
  startNamedTunnel,
  stopNamedTunnel,
  stopAllQuickTunnels,
  stopAllNamedTunnels,
  restoreNamedTunnels,
  loginCloudflare,
  logoutCloudflare,
  getAuthStatus,
  bindFixedDomain,
  unbindFixedDomain,
  detectCloudflared,
  installCloudflared,
} from '../../../src/main/cloudflared'

describe('CloudflareProvider', () => {
  let provider: CloudflareProvider

  beforeEach(() => {
    vi.clearAllMocks()
    provider = new CloudflareProvider()
  })

  it('has type "cloudflare"', () => {
    expect(provider.type).toBe('cloudflare')
  })

  it('detect() delegates to detectCloudflared and maps result', async () => {
    const env = await provider.detect()
    expect(detectCloudflared).toHaveBeenCalled()
    expect(env.status).toBe('available')
  })

  it('install() delegates to installCloudflared', async () => {
    await provider.install()
    expect(installCloudflared).toHaveBeenCalled()
  })

  it('startTunnel with mode=quick delegates to startQuickTunnel', async () => {
    const url = await provider.startTunnel('site1', 3000, { mode: 'quick' })
    expect(startQuickTunnel).toHaveBeenCalledWith('site1', 3000)
    expect(url).toBe('https://test.trycloudflare.com')
  })

  it('startTunnel with mode=named delegates to startNamedTunnel', async () => {
    await provider.startTunnel('site1', 3000, { mode: 'named' })
    expect(startNamedTunnel).toHaveBeenCalledWith('site1', 3000)
  })

  it('startTunnel defaults to quick mode', async () => {
    await provider.startTunnel('site1', 3000)
    expect(startQuickTunnel).toHaveBeenCalledWith('site1', 3000)
  })

  it('stopTunnel delegates to both stop functions', async () => {
    await provider.stopTunnel('site1')
    expect(stopQuickTunnel).toHaveBeenCalledWith('site1')
    expect(stopNamedTunnel).toHaveBeenCalledWith('site1')
  })

  it('stopAll delegates to both stopAll functions', async () => {
    await provider.stopAll()
    expect(stopAllQuickTunnels).toHaveBeenCalled()
    expect(stopAllNamedTunnels).toHaveBeenCalled()
  })

  it('restoreAll delegates to restoreNamedTunnels', async () => {
    const getSitePort = vi.fn()
    await provider.restoreAll(getSitePort)
    expect(restoreNamedTunnels).toHaveBeenCalledWith(getSitePort)
  })

  it('login delegates to loginCloudflare and maps result', async () => {
    const auth = await provider.login()
    expect(loginCloudflare).toHaveBeenCalled()
    expect(auth.status).toBe('logged_in')
  })

  it('logout delegates to logoutCloudflare', async () => {
    await provider.logout()
    expect(logoutCloudflare).toHaveBeenCalled()
  })

  it('getAuthStatus delegates and maps result', () => {
    const auth = provider.getAuthStatus()
    expect(getAuthStatus).toHaveBeenCalled()
    expect(auth.status).toBe('logged_out')
  })

  it('bindDomain delegates to bindFixedDomain', async () => {
    const url = await provider.bindDomain!('site1', 3000, 'my.domain.com')
    expect(bindFixedDomain).toHaveBeenCalledWith('site1', 3000, 'my.domain.com')
    expect(url).toBe('https://my.domain.com')
  })

  it('unbindDomain delegates to unbindFixedDomain', async () => {
    await provider.unbindDomain!('site1')
    expect(unbindFixedDomain).toHaveBeenCalledWith('site1')
  })
})
