import * as siteStore from './store'
import type { TunnelProvider, ProviderTunnelInfo } from '../shared/provider-types'

const DEFAULT_PROVIDER = 'cloudflare'

export class TunnelProviderManager {
  private providers: Map<string, TunnelProvider> = new Map()

  register(provider: TunnelProvider): void {
    this.providers.set(provider.type, provider)
  }

  get(type: string): TunnelProvider {
    const provider = this.providers.get(type)
    if (!provider) {
      throw new Error(`Unknown tunnel provider: ${type}`)
    }
    return provider
  }

  getForSite(siteId: string): TunnelProvider {
    const sites = siteStore.getSites()
    const site = sites.find((s) => s.id === siteId)
    const providerType = site?.providerType || DEFAULT_PROVIDER
    return this.get(providerType)
  }

  getTunnelInfoAcrossProviders(siteId: string): ProviderTunnelInfo | undefined {
    for (const provider of this.providers.values()) {
      const info = provider.getTunnelInfo(siteId)
      if (info) return info
    }
    return undefined
  }

  async restoreAll(getSitePort: (siteId: string) => number | null): Promise<void> {
    const promises = Array.from(this.providers.values()).map((p) =>
      p.restoreAll(getSitePort)
    )
    await Promise.allSettled(promises)
  }

  async stopAll(): Promise<void> {
    const promises = Array.from(this.providers.values()).map((p) => p.stopAll())
    await Promise.allSettled(promises)
  }
}
