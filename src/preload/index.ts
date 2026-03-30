import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { SiteInfo, CloudflaredEnv, CloudflareAuth, TunnelInfo, UrlAddResult, LanInfo, ElectronAPI, AddSiteParams, AppSettings, FrpServerConfig, BoreServerConfig, ShareRecord, VisitorEvent, RemoteConsoleEntry, NotificationItem, RequestLogEntry } from '../shared/types'
import type { UpdateState, ForceUpdateCheckResult } from '../shared/update-types'

const electronAPI: ElectronAPI = {
  // Site management
  addSite: (params: AddSiteParams): Promise<SiteInfo> => {
    return ipcRenderer.invoke('add-site', params)
  },

  removeSite: (id: string): Promise<void> => {
    return ipcRenderer.invoke('remove-site', id)
  },

  renameSite: (id: string, newName: string): Promise<void> => {
    return ipcRenderer.invoke('rename-site', id, newName)
  },

  getSites: (): Promise<SiteInfo[]> => {
    return ipcRenderer.invoke('get-sites')
  },

  // Server control
  startServer: (id: string): Promise<void> => {
    return ipcRenderer.invoke('start-server', id)
  },

  stopServer: (id: string): Promise<void> => {
    return ipcRenderer.invoke('stop-server', id)
  },

  // Browser
  openInBrowser: (id: string): Promise<void> => {
    return ipcRenderer.invoke('open-in-browser', id)
  },

  // Folder selection
  selectFolder: (): Promise<string | null> => {
    return ipcRenderer.invoke('select-folder')
  },

  // Drag-and-drop path resolution
  getPathForFile: (file: File): string => {
    return webUtils.getPathForFile(file)
  },

  // Clipboard (delegated to main process for sandbox compatibility)
  readClipboardText: (): Promise<string> => {
    return ipcRenderer.invoke('read-clipboard-text')
  },

  readClipboardFilePaths: (): Promise<string[]> => {
    return ipcRenderer.invoke('read-clipboard-file-paths')
  },

  onPasteShortcut: (callback: () => void): (() => void) => {
    const handler = (): void => {
      callback()
    }
    ipcRenderer.on('paste-shortcut', handler)
    return () => {
      ipcRenderer.removeListener('paste-shortcut', handler)
    }
  },

  // Menu commands (push from main)
  onMenuAddSite: (callback: () => void): (() => void) => {
    const handler = (): void => callback()
    ipcRenderer.on('menu:add-site', handler)
    return () => ipcRenderer.removeListener('menu:add-site', handler)
  },

  onMenuOpenSettings: (callback: () => void): (() => void) => {
    const handler = (): void => callback()
    ipcRenderer.on('menu:open-settings', handler)
    return () => ipcRenderer.removeListener('menu:open-settings', handler)
  },

  onMenuOpenInBrowser: (callback: () => void): (() => void) => {
    const handler = (): void => callback()
    ipcRenderer.on('menu:open-in-browser', handler)
    return () => ipcRenderer.removeListener('menu:open-in-browser', handler)
  },

  onMenuRestartServer: (callback: () => void): (() => void) => {
    const handler = (): void => callback()
    ipcRenderer.on('menu:restart-server', handler)
    return () => ipcRenderer.removeListener('menu:restart-server', handler)
  },

  onMenuRemoveSite: (callback: () => void): (() => void) => {
    const handler = (): void => callback()
    ipcRenderer.on('menu:remove-site', handler)
    return () => ipcRenderer.removeListener('menu:remove-site', handler)
  },

  onMenuShowShortcuts: (callback: () => void): (() => void) => {
    const handler = (): void => callback()
    ipcRenderer.on('menu:show-shortcuts', handler)
    return () => ipcRenderer.removeListener('menu:show-shortcuts', handler)
  },

  // --- frp Provider ---

  getFrpStatus: (): Promise<CloudflaredEnv> => {
    return ipcRenderer.invoke('get-frp-status')
  },

  installFrp: (): Promise<void> => {
    return ipcRenderer.invoke('install-frp')
  },

  getFrpConfig: (): Promise<FrpServerConfig | null> => {
    return ipcRenderer.invoke('get-frp-config')
  },

  setFrpConfig: (config: FrpServerConfig): Promise<FrpServerConfig> => {
    return ipcRenderer.invoke('set-frp-config', config)
  },

  startFrpTunnel: (siteId: string, opts?: Record<string, unknown>): Promise<string> => {
    return ipcRenderer.invoke('start-frp-tunnel', siteId, opts)
  },

  setSiteProvider: (siteId: string, providerType: string): Promise<void> => {
    return ipcRenderer.invoke('set-site-provider', siteId, providerType)
  },

  onFrpStatusChanged: (callback: (env: CloudflaredEnv) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, env: CloudflaredEnv): void => {
      callback(env)
    }
    ipcRenderer.on('frp-status-changed', handler)
    return () => {
      ipcRenderer.removeListener('frp-status-changed', handler)
    }
  },

  // --- bore Provider ---

  getBoreStatus: (): Promise<CloudflaredEnv> => {
    return ipcRenderer.invoke('get-bore-status')
  },

  installBore: (): Promise<void> => {
    return ipcRenderer.invoke('install-bore')
  },

  getBoreConfig: (): Promise<BoreServerConfig | null> => {
    return ipcRenderer.invoke('get-bore-config')
  },

  setBoreConfig: (config: BoreServerConfig): Promise<BoreServerConfig> => {
    return ipcRenderer.invoke('set-bore-config', config)
  },

  startBoreTunnel: (siteId: string, opts?: Record<string, unknown>): Promise<string> => {
    return ipcRenderer.invoke('start-bore-tunnel', siteId, opts)
  },

  onBoreStatusChanged: (callback: (env: CloudflaredEnv) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, env: CloudflaredEnv): void => {
      callback(env)
    }
    ipcRenderer.on('bore-status-changed', handler)
    return () => {
      ipcRenderer.removeListener('bore-status-changed', handler)
    }
  },

  // Default Domain
  setDefaultDomain: (siteId: string, domain: string): Promise<void> => {
    return ipcRenderer.invoke('set-default-domain', siteId, domain)
  },

  clearDefaultDomain: (siteId: string): Promise<void> => {
    return ipcRenderer.invoke('clear-default-domain', siteId)
  },

  // LAN Sharing
  getLanInfo: (): Promise<LanInfo> => {
    return ipcRenderer.invoke('get-lan-info')
  },

  refreshLan: (): Promise<void> => {
    return ipcRenderer.invoke('refresh-lan')
  },

  // Settings
  getSettings: (): Promise<AppSettings> => {
    return ipcRenderer.invoke('get-settings')
  },

  updateSettings: (patch: Partial<AppSettings>): Promise<AppSettings> => {
    return ipcRenderer.invoke('update-settings', patch)
  },

  onSettingsChanged: (callback: (settings: AppSettings) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, settings: AppSettings): void => {
      callback(settings)
    }
    ipcRenderer.on('settings-changed', handler)
    return () => {
      ipcRenderer.removeListener('settings-changed', handler)
    }
  },

  // Finder right-click integration
  isQuickActionInstalled: (): Promise<boolean> => {
    return ipcRenderer.invoke('is-quick-action-installed')
  },

  installQuickAction: (): Promise<void> => {
    return ipcRenderer.invoke('install-quick-action')
  },

  onUrlAddResult: (callback: (result: UrlAddResult) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, result: UrlAddResult): void => {
      callback(result)
    }
    ipcRenderer.on('url-add-result', handler)
    return () => {
      ipcRenderer.removeListener('url-add-result', handler)
    }
  },

  // Event listeners
  onSiteUpdated: (callback: (sites: SiteInfo[]) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, sites: SiteInfo[]): void => {
      callback(sites)
    }
    ipcRenderer.on('site-updated', handler)
    return () => {
      ipcRenderer.removeListener('site-updated', handler)
    }
  },

  onFileChanged: (callback: (siteId: string) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, siteId: string): void => {
      callback(siteId)
    }
    ipcRenderer.on('file-changed', handler)
    return () => {
      ipcRenderer.removeListener('file-changed', handler)
    }
  },

  // --- Cloudflared Environment ---

  getCloudflaredStatus: (): Promise<CloudflaredEnv> => {
    return ipcRenderer.invoke('get-cloudflared-status')
  },

  installCloudflared: (): Promise<void> => {
    return ipcRenderer.invoke('install-cloudflared')
  },

  // --- Quick Tunnel ---

  startQuickTunnel: (siteId: string): Promise<string> => {
    return ipcRenderer.invoke('start-quick-tunnel', siteId)
  },

  stopTunnel: (siteId: string): Promise<void> => {
    return ipcRenderer.invoke('stop-tunnel', siteId)
  },

  // --- Cloudflare Auth ---

  loginCloudflare: (): Promise<CloudflareAuth> => {
    return ipcRenderer.invoke('login-cloudflare')
  },

  logoutCloudflare: (): Promise<void> => {
    return ipcRenderer.invoke('logout-cloudflare')
  },

  getAuthStatus: (): Promise<CloudflareAuth> => {
    return ipcRenderer.invoke('get-auth-status')
  },

  // --- Fixed Domain (Named Tunnel + DNS) ---

  bindFixedDomain: (siteId: string, domain: string): Promise<string> => {
    return ipcRenderer.invoke('bind-fixed-domain', siteId, domain)
  },

  unbindFixedDomain: (siteId: string): Promise<void> => {
    return ipcRenderer.invoke('unbind-fixed-domain', siteId)
  },

  startNamedTunnel: (siteId: string): Promise<void> => {
    return ipcRenderer.invoke('start-named-tunnel', siteId)
  },

  stopNamedTunnel: (siteId: string): Promise<void> => {
    return ipcRenderer.invoke('stop-named-tunnel', siteId)
  },

  // --- Cloudflared Event Listeners ---

  onCloudflaredStatusChanged: (callback: (env: CloudflaredEnv) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, env: CloudflaredEnv): void => {
      callback(env)
    }
    ipcRenderer.on('cloudflared-status-changed', handler)
    return () => {
      ipcRenderer.removeListener('cloudflared-status-changed', handler)
    }
  },

  onAuthStatusChanged: (callback: (auth: CloudflareAuth) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, auth: CloudflareAuth): void => {
      callback(auth)
    }
    ipcRenderer.on('auth-status-changed', handler)
    return () => {
      ipcRenderer.removeListener('auth-status-changed', handler)
    }
  },

  onTunnelStatusChanged: (
    callback: (siteId: string, tunnel: TunnelInfo | null) => void
  ): (() => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      siteId: string,
      tunnel: TunnelInfo | null
    ): void => {
      callback(siteId, tunnel)
    }
    ipcRenderer.on('tunnel-status-changed', handler)
    return () => {
      ipcRenderer.removeListener('tunnel-status-changed', handler)
    }
  },

  // --- Share History ---

  getShareHistory: (): Promise<ShareRecord[]> => {
    return ipcRenderer.invoke('share-history:get-records')
  },

  exportShareHistory: (): Promise<boolean> => {
    return ipcRenderer.invoke('share-history:export')
  },

  onShareHistoryChanged: (callback: (records: ShareRecord[]) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, records: ShareRecord[]): void => {
      callback(records)
    }
    ipcRenderer.on('share-history-changed', handler)
    return () => {
      ipcRenderer.removeListener('share-history-changed', handler)
    }
  },

  // --- Visitor Tracking ---

  onVisitorEvent: (callback: (event: VisitorEvent) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, ev: VisitorEvent): void => {
      callback(ev)
    }
    ipcRenderer.on('visitor-event', handler)
    return () => {
      ipcRenderer.removeListener('visitor-event', handler)
    }
  },

  // --- Notification Center ---

  getNotifications: (): Promise<NotificationItem[]> => {
    return ipcRenderer.invoke('notification-center:get-all')
  },

  markNotificationRead: (id: string): Promise<void> => {
    return ipcRenderer.invoke('notification-center:mark-read', id)
  },

  markAllNotificationsRead: (): Promise<void> => {
    return ipcRenderer.invoke('notification-center:mark-all-read')
  },

  getUnreadNotificationCount: (): Promise<number> => {
    return ipcRenderer.invoke('notification-center:get-unread-count')
  },

  onNewNotification: (callback: (item: NotificationItem) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, item: NotificationItem): void => {
      callback(item)
    }
    ipcRenderer.on('notification-center:new', handler)
    return () => {
      ipcRenderer.removeListener('notification-center:new', handler)
    }
  },

  onNotificationsUpdated: (callback: (unreadCount: number) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, unreadCount: number): void => {
      callback(unreadCount)
    }
    ipcRenderer.on('notification-center:updated', handler)
    return () => {
      ipcRenderer.removeListener('notification-center:updated', handler)
    }
  },

  // --- Remote Console ---

  getRemoteConsoleLogs: (siteId: string): Promise<RemoteConsoleEntry[]> => {
    return ipcRenderer.invoke('get-remote-console-logs', siteId)
  },

  clearRemoteConsoleLogs: (siteId: string): Promise<void> => {
    return ipcRenderer.invoke('clear-remote-console-logs', siteId)
  },

  onRemoteConsoleEntry: (callback: (entry: RemoteConsoleEntry) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, entry: RemoteConsoleEntry): void => {
      callback(entry)
    }
    ipcRenderer.on('remote-console-entry', handler)
    return () => {
      ipcRenderer.removeListener('remote-console-entry', handler)
    }
  },

  // --- Request Log ---

  getRequestLog: (siteId: string): Promise<RequestLogEntry[]> => {
    return ipcRenderer.invoke('request-log:get', siteId)
  },

  clearRequestLog: (siteId: string): Promise<void> => {
    return ipcRenderer.invoke('request-log:clear', siteId)
  },

  onRequestLogEntry: (callback: (entry: RequestLogEntry) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, entry: RequestLogEntry): void => {
      callback(entry)
    }
    ipcRenderer.on('request-log:new', handler)
    return () => {
      ipcRenderer.removeListener('request-log:new', handler)
    }
  },

  // --- Auto Update ---

  getAppVersion: (): Promise<string> => {
    return ipcRenderer.invoke('get-app-version')
  },

  getUpdateState: (): Promise<UpdateState> => {
    return ipcRenderer.invoke('get-update-state')
  },

  checkForUpdates: (): Promise<void> => {
    return ipcRenderer.invoke('check-for-updates')
  },

  downloadUpdate: (): Promise<void> => {
    return ipcRenderer.invoke('download-update')
  },

  installUpdate: (): Promise<void> => {
    return ipcRenderer.invoke('install-update')
  },

  checkForceUpdate: (): Promise<ForceUpdateCheckResult> => {
    return ipcRenderer.invoke('check-force-update')
  },

  onUpdateStateChanged: (callback: (state: UpdateState) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, state: UpdateState): void => {
      callback(state)
    }
    ipcRenderer.on('update-state-changed', handler)
    return () => {
      ipcRenderer.removeListener('update-state-changed', handler)
    }
  }
}

contextBridge.exposeInMainWorld('electron', electronAPI)
