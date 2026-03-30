import type { UpdateState, ForceUpdateCheckResult } from './update-types'

// --- Site Serve Mode ---

export type ServeMode = 'static' | 'proxy'

// --- SiteInfo (renderer-facing) ---

interface BaseSiteInfo {
  id: string
  name: string
  port: number
  status: 'running' | 'stopped' | 'error'
  url: string // e.g., "http://localhost:3001"
  lanUrl?: string // e.g., "http://192.168.1.100:3001" — auto-detected for running sites
  lanInterfaceName?: string // e.g., "en0" — helps identify the network interface
  lanHasMultipleInterfaces?: boolean // true when multiple non-VPN LAN interfaces detected
  tunnel?: TunnelInfo
  providerType?: string // 'cloudflare' | 'frp' | 'bore' — for UI badge
  defaultDomain?: string // pre-configured domain for one-click named tunnel
  tags?: string[]
}

export interface StaticSiteInfo extends BaseSiteInfo {
  serveMode: 'static'
  folderPath: string
}

export interface ProxySiteInfo extends BaseSiteInfo {
  serveMode: 'proxy'
  proxyTarget: string
  passthrough?: boolean
  passthroughPort?: number
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
  | 'verifying'
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
  warningMessage?: string
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
  directoryListing?: boolean // opt-in: expose folder listing (default false)
  providerType?: string  // 'cloudflare' | 'frp' | 'bore' — defaults to 'cloudflare' at read time
  defaultDomain?: string // pre-configured domain for one-click named tunnel
  tags?: string[]
}

export interface StoredProxySite {
  id: string
  name: string
  serveMode: 'proxy'
  proxyTarget: string
  passthrough?: boolean
  passthroughPort?: number
  providerType?: string  // 'cloudflare' | 'frp' | 'bore' — defaults to 'cloudflare' at read time
  defaultDomain?: string // pre-configured domain for one-click named tunnel
  tags?: string[]
}

export type StoredSite = StoredStaticSite | StoredProxySite

// --- Share History ---

export interface ShareRecord {
  id: string
  siteId: string
  siteName: string
  sitePath: string // static folder path or proxy target URL
  tunnelUrl: string
  providerType: string
  startedAt: string // ISO 8601
  endedAt: string | null // null = in progress
  abnormalEnd: boolean // unexpected termination
}

// --- Migration ---

export function migrateSite(raw: unknown): StoredSite {
  const obj = raw as Record<string, unknown>
  // Already migrated — return as-is without allocating a new object
  if (obj.serveMode === 'static' || obj.serveMode === 'proxy') {
    return obj as unknown as StoredSite
  }
  // Legacy record without serveMode — normalize to static
  return {
    id: obj.id as string,
    name: obj.name as string,
    serveMode: 'static',
    folderPath: obj.folderPath as string,
    ...(obj.providerType ? { providerType: obj.providerType as string } : {})
  }
}

// --- Validation ---

export const DOMAIN_REGEX = /^[a-zA-Z0-9]([a-zA-Z0-9-]*\.)+[a-zA-Z]{2,}$/

// --- Visitor Event ---

export interface VisitorEvent {
  siteId: string
  visitorIp: string
  timestamp: number
  requestPath: string
  siteName: string
}

// --- Notification Center ---

export interface NotificationItem {
  id: string
  siteId: string
  siteName: string
  visitorIp: string
  timestamp: number
  read: boolean
}

// --- Remote Console ---

export type ConsoleLevel = 'log' | 'warn' | 'error'

export interface RemoteConsoleEntry {
  type: 'console'
  level: ConsoleLevel
  args: unknown[]
  timestamp: number
  sessionId: string
  siteId: string
}

// --- Request Log ---

export interface RequestLogEntry {
  id: string
  siteId: string
  timestamp: number
  method: string
  path: string
  statusCode: number
  duration: number // ms
  requestHeaders: Record<string, string | string[] | undefined>
  responseHeaders: Record<string, string | string[] | undefined>
  requestBody: string | null // null if no body, GET, or truncated beyond limit
  requestBodySize: number
  requestBodyTruncated: boolean
}

// --- App Settings ---

export interface AppSettings {
  autoStartServers: boolean
  defaultServeMode: ServeMode
  visitorNotifications: boolean
  remoteConsoleEnabled: boolean
  requestLogMaxEntries: number
}

export const DEFAULT_SETTINGS: AppSettings = {
  autoStartServers: false,
  defaultServeMode: 'static',
  visitorNotifications: true,
  remoteConsoleEnabled: false,
  requestLogMaxEntries: 200
}

// --- Add Site Params (IPC) ---

export type AddSiteParams =
  | { serveMode: 'static'; name: string; folderPath: string }
  | { serveMode: 'proxy'; name: string; proxyTarget: string; passthrough?: boolean }

export interface UrlAddResult {
  success: boolean
  siteName?: string
  errorMessage?: string
}

/** LAN network info (renderer-facing) */
export interface LanInfo {
  interfaces: { name: string; ip: string }[]
}

/** frp server config (renderer-facing, token is already decrypted) */
export interface FrpServerConfig {
  serverAddr: string
  serverPort: number
  authToken?: string
}

/** bore server config (renderer-facing, secret is already decrypted) */
export interface BoreServerConfig {
  serverAddr: string
  serverPort: number
  secret?: string
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
  readClipboardText: () => Promise<string>
  readClipboardFilePaths: () => Promise<string[]>
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

  // --- frp Provider ---
  getFrpStatus: () => Promise<CloudflaredEnv>
  installFrp: () => Promise<void>
  getFrpConfig: () => Promise<FrpServerConfig | null>
  setFrpConfig: (config: FrpServerConfig) => Promise<FrpServerConfig>
  startFrpTunnel: (siteId: string, opts?: Record<string, unknown>) => Promise<string>
  setSiteProvider: (siteId: string, providerType: string) => Promise<void>
  onFrpStatusChanged: (callback: (env: CloudflaredEnv) => void) => () => void

  // --- bore Provider ---
  getBoreStatus: () => Promise<CloudflaredEnv>
  installBore: () => Promise<void>
  getBoreConfig: () => Promise<BoreServerConfig | null>
  setBoreConfig: (config: BoreServerConfig) => Promise<BoreServerConfig>
  startBoreTunnel: (siteId: string, opts?: Record<string, unknown>) => Promise<string>
  onBoreStatusChanged: (callback: (env: CloudflaredEnv) => void) => () => void

  // Default Domain
  setDefaultDomain: (siteId: string, domain: string) => Promise<void>
  clearDefaultDomain: (siteId: string) => Promise<void>

  // LAN Sharing
  getLanInfo: () => Promise<LanInfo>
  refreshLan: () => Promise<void>

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

  // Share History
  getShareHistory: () => Promise<ShareRecord[]>
  exportShareHistory: () => Promise<boolean>
  onShareHistoryChanged: (callback: (records: ShareRecord[]) => void) => () => void

  // Visitor Tracking
  onVisitorEvent: (callback: (event: VisitorEvent) => void) => () => void

  // Notification Center
  getNotifications: () => Promise<NotificationItem[]>
  markNotificationRead: (id: string) => Promise<void>
  markAllNotificationsRead: () => Promise<void>
  getUnreadNotificationCount: () => Promise<number>
  onNewNotification: (callback: (item: NotificationItem) => void) => () => void
  onNotificationsUpdated: (callback: (unreadCount: number) => void) => () => void

  // Remote Console
  getRemoteConsoleLogs: (siteId: string) => Promise<RemoteConsoleEntry[]>
  clearRemoteConsoleLogs: (siteId: string) => Promise<void>
  onRemoteConsoleEntry: (callback: (entry: RemoteConsoleEntry) => void) => () => void

  // Site Tags
  updateSiteTags: (siteId: string, tags: string[]) => Promise<void>

  // Request Log
  getRequestLog: (siteId: string) => Promise<RequestLogEntry[]>
  clearRequestLog: (siteId: string) => Promise<void>
  onRequestLogEntry: (callback: (entry: RequestLogEntry) => void) => () => void

  // Auto Update
  getAppVersion: () => Promise<string>
  getUpdateState: () => Promise<UpdateState>
  checkForUpdates: () => Promise<void>
  downloadUpdate: () => Promise<void>
  installUpdate: () => Promise<void>
  checkForceUpdate: () => Promise<ForceUpdateCheckResult>
  onUpdateStateChanged: (callback: (state: UpdateState) => void) => () => void
}

declare global {
  interface Window {
    electron: ElectronAPI
  }
}
