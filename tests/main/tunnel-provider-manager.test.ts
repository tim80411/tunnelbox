import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock electron-store dependency before importing manager
vi.mock('../../src/main/store', () => ({
  getSites: vi.fn().mockReturnValue([]),
}))

import { TunnelProviderManager } from '../../src/main/tunnel-provider-manager'
import * as siteStore from '../../src/main/store'
import type { TunnelProvider, ProviderTunnelInfo } from '../../src/shared/provider-types'

function createMockProvider(type: string): TunnelProvider {
  return {
    type,
    detect: vi.fn().mockResolvedValue({ status: 'available' }),
    install: vi.fn().mockResolvedValue(undefined),
    login: vi.fn().mockResolvedValue({ status: 'logged_in' }),
    logout: vi.fn().mockResolvedValue(undefined),
    getAuthStatus: vi.fn().mockReturnValue({ status: 'logged_out' }),
    startTunnel: vi.fn().mockResolvedValue('https://example.com'),
    stopTunnel: vi.fn().mockResolvedValue(undefined),
    getTunnelInfo: vi.fn().mockReturnValue(undefined),
    restoreAll: vi.fn().mockResolvedValue(undefined),
    stopAll: vi.fn().mockResolvedValue(undefined),
  }
}

describe('TunnelProviderManager', () => {
  let manager: TunnelProviderManager

  beforeEach(() => {
    vi.clearAllMocks()
    manager = new TunnelProviderManager()
  })

  it('registers and retrieves a provider by type', () => {
    const provider = createMockProvider('cloudflare')
    manager.register(provider)
    expect(manager.get('cloudflare')).toBe(provider)
  })

  it('throws on unknown provider type', () => {
    expect(() => manager.get('unknown')).toThrow('Unknown tunnel provider: unknown')
  })

  it('getForSite returns cloudflare as default', () => {
    const cf = createMockProvider('cloudflare')
    manager.register(cf)
    expect(manager.getForSite('any-site-id')).toBe(cf)
  })

  it('getForSite returns correct provider when site has explicit providerType', () => {
    const cf = createMockProvider('cloudflare')
    const frp = createMockProvider('frp')
    manager.register(cf)
    manager.register(frp)

    vi.mocked(siteStore.getSites).mockReturnValue([
      { id: 'site-frp', name: 'FRP Site', folderPath: '/tmp/frp', providerType: 'frp' }
    ])

    expect(manager.getForSite('site-frp')).toBe(frp)
  })

  it('stopAll delegates to all registered providers', async () => {
    const cf = createMockProvider('cloudflare')
    const frp = createMockProvider('frp')
    manager.register(cf)
    manager.register(frp)

    await manager.stopAll()

    expect(cf.stopAll).toHaveBeenCalledOnce()
    expect(frp.stopAll).toHaveBeenCalledOnce()
  })

  it('restoreAll delegates to all registered providers', async () => {
    const cf = createMockProvider('cloudflare')
    manager.register(cf)

    const getSitePort = vi.fn().mockReturnValue(3000)
    await manager.restoreAll(getSitePort)

    expect(cf.restoreAll).toHaveBeenCalledWith(getSitePort)
  })

  it('getTunnelInfoAcrossProviders returns info from first matching provider', () => {
    const tunnelInfo: ProviderTunnelInfo = {
      providerType: 'cloudflare',
      status: 'running',
      publicUrl: 'https://test.trycloudflare.com'
    }
    const cf = createMockProvider('cloudflare')
    vi.mocked(cf.getTunnelInfo).mockReturnValue(tunnelInfo)
    manager.register(cf)

    expect(manager.getTunnelInfoAcrossProviders('site1')).toBe(tunnelInfo)
  })

  it('getTunnelInfoAcrossProviders returns undefined when no provider has tunnel', () => {
    const cf = createMockProvider('cloudflare')
    vi.mocked(cf.getTunnelInfo).mockReturnValue(undefined)
    manager.register(cf)

    expect(manager.getTunnelInfoAcrossProviders('site1')).toBeUndefined()
  })
})
