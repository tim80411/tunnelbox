import type { TunnelStatus } from './types'

/** Provider environment status (generalizes CloudflaredEnv) */
export interface ProviderEnv {
  status: 'checking' | 'available' | 'not_installed' | 'outdated' | 'installing' | 'install_failed' | 'error'
  version?: string
  errorMessage?: string
}

/** Provider auth info (generalizes CloudflareAuth) */
export interface ProviderAuthInfo {
  status: 'logged_out' | 'logging_in' | 'logged_in' | 'expired' | 'not_required'
  accountEmail?: string
  accountId?: string
}

/** Provider-agnostic tunnel info (generalizes TunnelInfo) */
export interface ProviderTunnelInfo {
  providerType: string
  status: TunnelStatus
  publicUrl?: string
  tunnelId?: string
  errorMessage?: string
  warningMessage?: string
}

/** Provider-specific tunnel options — each provider casts to its own type */
export type TunnelOptions = Record<string, unknown>

/** The core provider interface */
export interface TunnelProvider {
  readonly type: string

  // Environment
  detect(): Promise<ProviderEnv>
  install(): Promise<void>

  // Auth
  login(): Promise<ProviderAuthInfo>
  logout(): Promise<void>
  getAuthStatus(): ProviderAuthInfo

  // Tunnel lifecycle
  startTunnel(siteId: string, port: number, opts?: TunnelOptions): Promise<string>
  stopTunnel(siteId: string): Promise<void>
  getTunnelInfo(siteId: string): ProviderTunnelInfo | undefined

  // Restore on boot
  restoreAll(getSitePort: (siteId: string) => number | null): Promise<void>

  // Fixed domain (optional)
  bindDomain?(siteId: string, port: number, domain: string): Promise<string>
  unbindDomain?(siteId: string): Promise<void>

  // Cleanup
  stopAll(): Promise<void>
}
