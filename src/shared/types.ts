export interface SiteInfo {
  id: string
  name: string
  folderPath: string
  port: number
  status: 'running' | 'stopped' | 'error'
  url: string // e.g., "http://localhost:3001"
  tunnel?: TunnelInfo
}

// --- Cloudflared Environment ---

export type CloudflaredStatus =
  | 'checking'
  | 'available'
  | 'not_installed'
  | 'outdated'
  | 'installing'
  | 'install_failed'
  | 'error'

export interface CloudflaredEnv {
  status: CloudflaredStatus
  version?: string
  errorMessage?: string
}

// --- Tunnel ---

export type TunnelType = 'quick' | 'named'

export type TunnelStatus =
  | 'starting'
  | 'running'
  | 'reconnecting'
  | 'stopped'
  | 'error'

export interface TunnelInfo {
  type: TunnelType
  status: TunnelStatus
  publicUrl?: string
  tunnelId?: string // For named tunnels
  errorMessage?: string
}

// --- Cloudflare Auth ---

export type AuthStatus = 'logged_out' | 'logging_in' | 'logged_in' | 'expired'

export interface CloudflareAuth {
  status: AuthStatus
  accountEmail?: string
  accountId?: string
}

// --- Named Tunnel Persistence ---

export interface StoredTunnel {
  siteId: string
  tunnelId: string
  tunnelName: string
}

export interface StoredAuth {
  certPath?: string
  accountEmail?: string
  accountId?: string
}

export interface StoredSite {
  id: string
  name: string
  folderPath: string
}

export interface ElectronAPI {
  // Site management
  addSite: (name: string, folderPath: string) => Promise<SiteInfo>
  removeSite: (id: string) => Promise<void>
  getSites: () => Promise<SiteInfo[]>

  // Server control
  startServer: (id: string) => Promise<void>
  stopServer: (id: string) => Promise<void>

  // Browser
  openInBrowser: (id: string) => Promise<void>

  // Folder selection
  selectFolder: () => Promise<string | null>

  // Drag-and-drop path resolution
  getPathForFile: (file: File) => string

  // --- Cloudflared Environment ---
  getCloudflaredStatus: () => Promise<CloudflaredEnv>
  installCloudflared: () => Promise<void>

  // --- Quick Tunnel ---
  startQuickTunnel: (siteId: string) => Promise<string>
  stopTunnel: (siteId: string) => Promise<void>

  // --- Cloudflare Auth ---
  loginCloudflare: () => Promise<CloudflareAuth>
  logoutCloudflare: () => Promise<void>
  getAuthStatus: () => Promise<CloudflareAuth>

  // --- Fixed Domain (Named Tunnel + DNS) ---
  bindFixedDomain: (siteId: string, domain: string) => Promise<string>
  unbindFixedDomain: (siteId: string) => Promise<void>
  startNamedTunnel: (siteId: string) => Promise<void>
  stopNamedTunnel: (siteId: string) => Promise<void>

  // Event listeners
  onSiteUpdated: (callback: (sites: SiteInfo[]) => void) => () => void
  onFileChanged: (callback: (siteId: string) => void) => () => void
  onCloudflaredStatusChanged: (callback: (env: CloudflaredEnv) => void) => () => void
  onAuthStatusChanged: (callback: (auth: CloudflareAuth) => void) => () => void
  onTunnelStatusChanged: (callback: (siteId: string, tunnel: TunnelInfo | null) => void) => () => void
}

declare global {
  interface Window {
    electron: ElectronAPI
  }
}
