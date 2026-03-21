// --- Site Serve Mode ---

export type ServeMode = 'static' | 'proxy'

// --- SiteInfo (renderer-facing) ---

interface BaseSiteInfo {
  id: string
  name: string
  port: number
  status: 'running' | 'stopped' | 'error'
  url: string // e.g., "http://localhost:3001"
  lanUrl?: string // e.g., "http://192.168.1.100:3001" — present when LAN sharing is enabled
  lanInterfaceName?: string // e.g., "en0" — helps identify the network interface
  tunnel?: TunnelInfo
}

export interface LanInfo {
  ip: string | null
  interfaces: Array<{ name: string; ip: string }>
}

export interface StaticSiteInfo extends BaseSiteInfo {
  serveMode: 'static'
  folderPath: string
}

export interface ProxySiteInfo extends BaseSiteInfo {
  serveMode: 'proxy'
  proxyTarget: string
}

export type SiteInfo = StaticSiteInfo | ProxySiteInfo

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

// --- StoredSite (persisted) ---

export interface StoredStaticSite {
  id: string
  name: string
  serveMode: 'static'
  folderPath: string
  providerType?: string  // 'cloudflare' | 'frp' — defaults to 'cloudflare' at read time
}

export interface StoredProxySite {
  id: string
  name: string
  serveMode: 'proxy'
  proxyTarget: string
  providerType?: string  // 'cloudflare' | 'frp' — defaults to 'cloudflare' at read time
}

export type StoredSite = StoredStaticSite | StoredProxySite

// --- Migration ---

export function migrateSite(raw: Record<string, unknown>): StoredSite {
  // Already migrated — return as-is without allocating a new object
  if (raw.serveMode === 'static' || raw.serveMode === 'proxy') {
    return raw as unknown as StoredSite
  }
  // Legacy record without serveMode — normalize to static
  return {
    id: raw.id as string,
    name: raw.name as string,
    serveMode: 'static',
    folderPath: raw.folderPath as string,
    ...(raw.providerType ? { providerType: raw.providerType as string } : {})
  }
}

// --- App Settings ---

export interface AppSettings {
  autoStartServers: boolean
  defaultServeMode: ServeMode
}

export const DEFAULT_SETTINGS: AppSettings = {
  autoStartServers: false,
  defaultServeMode: 'static'
}

// --- Add Site Params (IPC) ---

export type AddSiteParams =
  | { serveMode: 'static'; name: string; folderPath: string }
  | { serveMode: 'proxy'; name: string; proxyTarget: string }

export interface UrlAddResult {
  success: boolean
  siteName?: string
  errorMessage?: string
}

export interface ElectronAPI {
  // Site management
  addSite: (params: AddSiteParams) => Promise<SiteInfo>
  removeSite: (id: string) => Promise<void>
  renameSite: (id: string, newName: string) => Promise<void>
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

  // Clipboard
  readClipboardText: () => string
  onPasteShortcut: (callback: () => void) => () => void

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

  // LAN Sharing
  getLanInfo: () => Promise<LanInfo>
  setLanSharing: (siteId: string, enabled: boolean) => Promise<void>

  // Finder right-click integration
  onUrlAddResult: (callback: (result: UrlAddResult) => void) => () => void
  isQuickActionInstalled: () => Promise<boolean>
  installQuickAction: () => Promise<void>

  // Settings
  getSettings: () => Promise<AppSettings>
  updateSettings: (patch: Partial<AppSettings>) => Promise<AppSettings>
  onSettingsChanged: (callback: (settings: AppSettings) => void) => () => void

  // Event listeners
  onSiteUpdated: (callback: (sites: SiteInfo[]) => void) => () => void
  onFileChanged: (callback: (siteId: string) => void) => () => void
  onCloudflaredStatusChanged: (callback: (env: CloudflaredEnv) => void) => () => void
  onAuthStatusChanged: (callback: (auth: CloudflareAuth) => void) => () => void
  onTunnelStatusChanged: (callback: (siteId: string, tunnel: TunnelInfo | null) => void) => () => void

  // Menu commands (push from main)
  onMenuAddSite: (callback: () => void) => () => void
  onMenuOpenSettings: (callback: () => void) => () => void
  onMenuOpenInBrowser: (callback: () => void) => () => void
  onMenuRestartServer: (callback: () => void) => () => void
  onMenuRemoveSite: (callback: () => void) => () => void
  onMenuShowShortcuts: (callback: () => void) => () => void
}

declare global {
  interface Window {
    electron: ElectronAPI
  }
}
