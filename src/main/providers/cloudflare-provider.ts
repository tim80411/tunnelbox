import {
  detectCloudflared,
  installCloudflared,
  startQuickTunnel,
  stopQuickTunnel,
  getTunnelInfo,
  startNamedTunnel,
  stopNamedTunnel,
  getNamedTunnelInfo,
  stopAllQuickTunnels,
  stopAllNamedTunnels,
  restoreNamedTunnels,
  loginCloudflare,
  logoutCloudflare,
  getAuthStatus,
  bindFixedDomain,
  unbindFixedDomain
} from '../cloudflared'
import type {
  TunnelProvider,
  ProviderEnv,
  ProviderAuthInfo,
  ProviderTunnelInfo,
  TunnelOptions
} from '../../shared/provider-types'
import type { CloudflareAuth, CloudflaredEnv, TunnelInfo } from '../../shared/types'

/** Maps CloudflaredEnv -> ProviderEnv */
function mapEnv(env: CloudflaredEnv): ProviderEnv {
  return {
    status: env.status,
    version: env.version,
    errorMessage: env.errorMessage
  }
}

/** Maps CloudflareAuth -> ProviderAuthInfo */
function mapAuth(auth: CloudflareAuth): ProviderAuthInfo {
  return {
    status: auth.status,
    accountEmail: auth.accountEmail,
    accountId: auth.accountId
  }
}

/** Maps TunnelInfo -> ProviderTunnelInfo */
function mapTunnel(info: TunnelInfo): ProviderTunnelInfo {
  return {
    providerType: 'cloudflare',
    status: info.status,
    publicUrl: info.publicUrl,
    tunnelId: info.tunnelId,
    errorMessage: info.errorMessage
  }
}

export class CloudflareProvider implements TunnelProvider {
  readonly type = 'cloudflare'

  async detect(): Promise<ProviderEnv> {
    const env = await detectCloudflared()
    return mapEnv(env)
  }

  async install(): Promise<void> {
    await installCloudflared()
  }

  async login(): Promise<ProviderAuthInfo> {
    const auth = await loginCloudflare()
    return mapAuth(auth)
  }

  async logout(): Promise<void> {
    logoutCloudflare()
  }

  getAuthStatus(): ProviderAuthInfo {
    const auth = getAuthStatus()
    return mapAuth(auth)
  }

  async startTunnel(siteId: string, port: number, opts?: TunnelOptions): Promise<string> {
    const mode = (opts?.mode as string) || 'quick'
    if (mode === 'named') {
      await startNamedTunnel(siteId, port)
      const info = getNamedTunnelInfo(siteId)
      return info?.publicUrl || ''
    }
    return startQuickTunnel(siteId, port)
  }

  async stopTunnel(siteId: string): Promise<void> {
    stopQuickTunnel(siteId)
    stopNamedTunnel(siteId)
  }

  getTunnelInfo(siteId: string): ProviderTunnelInfo | undefined {
    const quick = getTunnelInfo(siteId)
    if (quick) return mapTunnel(quick)
    const named = getNamedTunnelInfo(siteId)
    if (named) return mapTunnel(named)
    return undefined
  }

  async restoreAll(getSitePort: (siteId: string) => number | null): Promise<void> {
    await restoreNamedTunnels(getSitePort)
  }

  async bindDomain(siteId: string, port: number, domain: string): Promise<string> {
    return bindFixedDomain(siteId, port, domain)
  }

  async unbindDomain(siteId: string): Promise<void> {
    await unbindFixedDomain(siteId)
  }

  async stopAll(): Promise<void> {
    stopAllQuickTunnels()
    stopAllNamedTunnels()
  }
}
