import { ipcMain, dialog, shell, BrowserWindow } from 'electron'
import { ServerManager } from './server-manager'
import * as siteStore from './store'
import type { TunnelProviderManager } from './tunnel-provider-manager'
import type { SiteInfo, CloudflaredEnv, LanInfo, AddSiteParams } from '../shared/types'
import type { SiteServer } from './server-manager'
import { initSiteActions } from './site-actions'
import { getLanIp, getAllLanIps } from '../core/lan-ip'
import * as hostsManager from './hosts-manager'
import type { DomainRouter } from './domain-router'

let serverManager: ServerManager
let domainRouterRef: DomainRouter | null = null

/** Sites with LAN sharing enabled (runtime state, not persisted). */
const lanSharingSites = new Set<string>()

function broadcastCloudflaredStatus(env: CloudflaredEnv): void {
  const windows = BrowserWindow.getAllWindows()
  for (const win of windows) {
    win.webContents.send('cloudflared-status-changed', env)
  }
}

export function getServerManager(): ServerManager {
  return serverManager
}

/**
 * Ensure domain router is started if there are any local domains configured.
 * If no local domains remain, stop the router.
 */
async function ensureDomainRouter(): Promise<void> {
  if (!domainRouterRef) return
  const sites = siteStore.getSites()
  const hasLocalDomains = sites.some((s) => s.localDomain)

  if (hasLocalDomains && !domainRouterRef.isRunning()) {
    try {
      await domainRouterRef.start(8080)
    } catch {
      // Port in use or other error — non-fatal
    }
  } else if (!hasLocalDomains && domainRouterRef.isRunning()) {
    await domainRouterRef.stop()
  }
}

export function registerIpcHandlers(
  manager: ServerManager,
  tunnelManager: TunnelProviderManager,
  domainRouter?: DomainRouter
): void {
  serverManager = manager
  domainRouterRef = domainRouter ?? null
  initSiteActions(manager, tunnelManager)

  const cfProvider = tunnelManager.get('cloudflare')

  function toSiteInfo(server: SiteServer): SiteInfo {
    const providerInfo = tunnelManager.getTunnelInfoAcrossProviders(server.id)
    const tunnel = providerInfo
      ? {
          type:
            providerInfo.providerType === 'cloudflare'
              ? providerInfo.tunnelId
                ? ('named' as const)
                : ('quick' as const)
              : ('quick' as const),
          status: providerInfo.status,
          publicUrl: providerInfo.publicUrl,
          tunnelId: providerInfo.tunnelId,
          errorMessage: providerInfo.errorMessage
        }
      : undefined
    const base = {
      id: server.id,
      name: server.name,
      port: server.port,
      status: server.status,
      url: server.status === 'running' ? `http://localhost:${server.port}` : '',
      ...(tunnel && { tunnel })
    }

    // LAN sharing URL
    if (server.status === 'running' && lanSharingSites.has(server.id)) {
      const allIps = getAllLanIps()
      if (allIps.length > 0) {
        ;(base as any).lanUrl = `http://${allIps[0].ip}:${server.port}`
        ;(base as any).lanInterfaceName = allIps[0].name
      }
    }

    // Attach local domain from store
    const storedSites = siteStore.getSites()
    const storedSite = storedSites.find((s) => s.id === server.id)
    if (storedSite?.localDomain) {
      ;(base as any).localDomain = storedSite.localDomain
    }

    if (server.serveMode === 'proxy') {
      return { ...base, serveMode: 'proxy' as const, proxyTarget: server.proxyTarget }
    }
    return { ...base, serveMode: 'static' as const, folderPath: server.folderPath }
  }

  function isValidProxyUrl(url: string): boolean {
    try {
      const parsed = new URL(url)
      return parsed.protocol === 'http:' || parsed.protocol === 'https:'
    } catch {
      return false
    }
  }

  function broadcastSiteUpdate(): void {
    const sites = serverManager.getServers().map(toSiteInfo)
    const windows = BrowserWindow.getAllWindows()
    for (const win of windows) {
      win.webContents.send('site-updated', sites)
    }
  }

  // --- Site Management ---

  ipcMain.handle('add-site', async (_event, params: AddSiteParams) => {
    try {
      // Validate name
      if (!params.name || !params.name.trim()) {
        throw new Error('請輸入網頁名稱')
      }

      const trimmedName = params.name.trim()

      // Check duplicate name
      const existingServers = serverManager.getServers()
      if (existingServers.some((s) => s.name === trimmedName)) {
        throw new Error(`名稱「${trimmedName}」已被使用`)
      }

      const id = serverManager.generateId()
      let storedSite: import('../shared/types').StoredSite

      if (params.serveMode === 'proxy') {
        if (!params.proxyTarget || !params.proxyTarget.trim()) {
          throw new Error('請輸入 Proxy 目標 URL')
        }
        const proxyTarget = params.proxyTarget.trim()
        if (!isValidProxyUrl(proxyTarget)) {
          throw new Error('請輸入有效的 URL（如 http://localhost:3000）')
        }
        storedSite = { id, name: trimmedName, serveMode: 'proxy', proxyTarget }
      } else {
        if (!params.folderPath || !params.folderPath.trim()) {
          throw new Error('請選擇資料夾路徑')
        }
        if (existingServers.some((s) => s.serveMode === 'static' && s.folderPath === params.folderPath)) {
          throw new Error('此路徑已被其他網頁使用')
        }
        storedSite = { id, name: trimmedName, serveMode: 'static', folderPath: params.folderPath }
      }

      const server = await serverManager.startServer(storedSite)
      siteStore.addSite(storedSite)

      const info = toSiteInfo(server)
      broadcastSiteUpdate()
      return info
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : 'Failed to add site')
    }
  })

  ipcMain.handle('remove-site', async (_event, id: string) => {
    try {
      // Best-effort tunnel stop — don't block removal
      try {
        await tunnelManager.getForSite(id).stopTunnel(id)
      } catch {
        /* ignore */
      }
      lanSharingSites.delete(id)

      // Clean up local domain hosts entry (Story 71)
      const storedSites2 = siteStore.getSites()
      const siteToRemove = storedSites2.find((s) => s.id === id)
      if (siteToRemove?.localDomain && process.platform === 'darwin') {
        try {
          hostsManager.removeHostsEntry(siteToRemove.localDomain)
        } catch {
          // Non-fatal — site removal continues even if hosts cleanup fails
        }
      }

      await serverManager.removeServer(id)
      siteStore.removeSite(id)

      // Stop domain router if no more local domains
      await ensureDomainRouter()

      broadcastSiteUpdate()
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : 'Failed to remove site')
    }
  })

  ipcMain.handle('get-sites', async () => {
    try {
      return serverManager.getServers().map(toSiteInfo)
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : 'Failed to get sites')
    }
  })

  // --- Server Control ---

  ipcMain.handle('start-server', async (_event, id: string) => {
    try {
      const existing = serverManager.getServer(id)
      if (!existing) throw new Error(`Site not found: ${id}`)
      if (existing.status === 'running') return

      await serverManager.startServer(existing as import('../shared/types').StoredSite)
      broadcastSiteUpdate()
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : 'Failed to start server')
    }
  })

  ipcMain.handle('stop-server', async (_event, id: string) => {
    try {
      // Best-effort tunnel stop — don't block server stop
      try {
        await tunnelManager.getForSite(id).stopTunnel(id)
      } catch {
        /* ignore */
      }
      // Auto-disable LAN sharing when stopping server
      lanSharingSites.delete(id)
      await serverManager.stopServer(id)
      broadcastSiteUpdate()
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : 'Failed to stop server')
    }
  })

  // --- Browser ---

  ipcMain.handle('open-in-browser', async (_event, id: string) => {
    try {
      const server = serverManager.getServer(id)
      if (!server) throw new Error(`Site not found: ${id}`)
      if (server.status !== 'running') throw new Error('Server is not running')
      await shell.openExternal(`http://localhost:${server.port}`)
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : 'Failed to open in browser')
    }
  })

  // --- Folder Selection ---

  ipcMain.handle('select-folder', async () => {
    try {
      const result = await dialog.showOpenDialog({
        properties: ['openDirectory']
      })
      if (result.canceled || result.filePaths.length === 0) {
        return null
      }
      return result.filePaths[0]
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : 'Failed to select folder')
    }
  })

  // --- LAN Sharing ---

  ipcMain.handle('get-lan-info', async (): Promise<LanInfo> => {
    try {
      return {
        ip: getLanIp(),
        interfaces: getAllLanIps()
      }
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : '取得區網資訊失敗')
    }
  })

  ipcMain.handle('set-lan-sharing', async (_event, siteId: string, enabled: boolean) => {
    try {
      const server = serverManager.getServer(siteId)
      if (!server) throw new Error('找不到此網頁')
      if (enabled && server.status !== 'running') throw new Error('本地伺服器尚未啟動')

      if (enabled) {
        const ip = getLanIp()
        if (!ip) throw new Error('未偵測到區網連線')
        lanSharingSites.add(siteId)
      } else {
        lanSharingSites.delete(siteId)
      }

      broadcastSiteUpdate()
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : '設定區網分享失敗')
    }
  })

  // --- Quick Tunnel ---

  ipcMain.handle('start-quick-tunnel', async (_event, siteId: string) => {
    try {
      const server = serverManager.getServer(siteId)
      if (!server) throw new Error('找不到此網頁')
      if (server.status !== 'running') throw new Error('本地伺服器尚未啟動')

      const url = await cfProvider.startTunnel(siteId, server.port, { mode: 'quick' })
      broadcastSiteUpdate()
      return url
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : '啟動 Quick Tunnel 失敗')
    }
  })

  ipcMain.handle('stop-tunnel', async (_event, siteId: string) => {
    try {
      await tunnelManager.getForSite(siteId).stopTunnel(siteId)
      broadcastSiteUpdate()
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : '停止 Tunnel 失敗')
    }
  })

  // --- Cloudflared Environment ---

  ipcMain.handle('get-cloudflared-status', async () => {
    try {
      return (await cfProvider.detect()) as CloudflaredEnv
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : '偵測 cloudflared 失敗')
    }
  })

  ipcMain.handle('install-cloudflared', async () => {
    try {
      broadcastCloudflaredStatus({ status: 'installing' })
      await cfProvider.install()
      const env = (await cfProvider.detect()) as CloudflaredEnv
      broadcastCloudflaredStatus(env)
    } catch (err) {
      const errorEnv: CloudflaredEnv = {
        status: 'install_failed',
        errorMessage: err instanceof Error ? err.message : '安裝 cloudflared 失敗'
      }
      broadcastCloudflaredStatus(errorEnv)
      throw new Error(errorEnv.errorMessage)
    }
  })

  // --- Cloudflare Auth ---

  ipcMain.handle('login-cloudflare', async () => {
    try {
      return await cfProvider.login()
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : '登入 Cloudflare 失敗')
    }
  })

  ipcMain.handle('logout-cloudflare', async () => {
    try {
      // Stop ALL tunnels before logout (not just named)
      await cfProvider.stopAll()
      await cfProvider.logout()
      broadcastSiteUpdate()
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : '登出 Cloudflare 失敗')
    }
  })

  ipcMain.handle('get-auth-status', async () => {
    try {
      return cfProvider.getAuthStatus()
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : '取得認證狀態失敗')
    }
  })

  // --- Fixed Domain (Named Tunnel + DNS) ---

  ipcMain.handle('bind-fixed-domain', async (_event, siteId: string, domain: string) => {
    try {
      const server = serverManager.getServer(siteId)
      if (!server) throw new Error('找不到此網頁')
      if (server.status !== 'running') throw new Error('本地伺服器尚未啟動')

      const url = await cfProvider.bindDomain!(siteId, server.port, domain)
      broadcastSiteUpdate()
      return url
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : '綁定固定網域失敗')
    }
  })

  ipcMain.handle('unbind-fixed-domain', async (_event, siteId: string) => {
    try {
      await cfProvider.unbindDomain!(siteId)
      broadcastSiteUpdate()
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : '解除綁定失敗')
    }
  })

  ipcMain.handle('start-named-tunnel', async (_event, siteId: string) => {
    try {
      const server = serverManager.getServer(siteId)
      if (!server) throw new Error('找不到此網頁')
      if (server.status !== 'running') throw new Error('本地伺服器尚未啟動')

      await cfProvider.startTunnel(siteId, server.port, { mode: 'named' })
      broadcastSiteUpdate()
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : '啟動 Named Tunnel 失敗')
    }
  })

  ipcMain.handle('stop-named-tunnel', async (_event, siteId: string) => {
    try {
      await cfProvider.stopTunnel(siteId)
      broadcastSiteUpdate()
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : '停止 Named Tunnel 失敗')
    }
  })

  // --- Local Domain ---

  ipcMain.handle('set-local-domain', async (_event, siteId: string, domain: string) => {
    try {
      const server = serverManager.getServer(siteId)
      if (!server) throw new Error('找不到此網頁')

      const trimmed = domain.trim().toLowerCase()
      if (!trimmed) throw new Error('請輸入域名')

      // Validate format
      if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$/.test(trimmed)) {
        throw new Error('域名格式不正確')
      }

      // Check reserved names
      const reserved = ['localhost', 'broadcasthost', 'ip6-localhost', 'ip6-loopback']
      if (reserved.includes(trimmed)) {
        throw new Error('此域名為系統保留名稱')
      }

      // Check uniqueness across all sites
      const allSites = siteStore.getSites()
      const duplicate = allSites.find((s) => s.id !== siteId && s.localDomain === trimmed)
      if (duplicate) {
        throw new Error('此域名已被其他站點使用')
      }

      // Check if domain is managed by another program
      if (process.platform === 'darwin' && hostsManager.isDomainManagedExternally(trimmed)) {
        throw new Error(`域名 "${trimmed}" 已被其他程式使用於 hosts 檔案中`)
      }

      // Remove old hosts entry if domain is changing
      const oldSite = allSites.find((s) => s.id === siteId)
      if (oldSite?.localDomain && oldSite.localDomain !== trimmed && process.platform === 'darwin') {
        try {
          hostsManager.removeHostsEntry(oldSite.localDomain)
        } catch {
          // Best effort — don't block on hosts cleanup
        }
      }

      // Add hosts entry (macOS only)
      if (process.platform === 'darwin') {
        hostsManager.addHostsEntry(trimmed)
      }

      // Persist domain
      siteStore.updateSite(siteId, { localDomain: trimmed })

      // Ensure domain router is running
      await ensureDomainRouter()

      broadcastSiteUpdate()
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : '設定本地域名失敗')
    }
  })

  ipcMain.handle('remove-local-domain', async (_event, siteId: string) => {
    try {
      const server = serverManager.getServer(siteId)
      if (!server) throw new Error('找不到此網頁')

      // Get current domain before removing
      const storedSites = siteStore.getSites()
      const currentSite = storedSites.find((s) => s.id === siteId)
      const oldDomain = currentSite?.localDomain

      // Remove domain from store
      siteStore.updateSite(siteId, { localDomain: undefined })

      // Remove hosts entry (macOS only)
      if (oldDomain && process.platform === 'darwin') {
        try {
          hostsManager.removeHostsEntry(oldDomain)
        } catch (err) {
          // Non-fatal — domain still removed from store
          const windows = BrowserWindow.getAllWindows()
          for (const win of windows) {
            win.webContents.send('site-updated', serverManager.getServers().map(toSiteInfo))
          }
          throw new Error('域名已移除，但無法清理 hosts 檔案（可能需要手動清理）')
        }
      }

      // Stop domain router if no more local domains
      await ensureDomainRouter()

      broadcastSiteUpdate()
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : '移除本地域名失敗')
    }
  })

  // --- File Change Forwarding ---

  serverManager.onFileChange((siteId) => {
    const windows = BrowserWindow.getAllWindows()
    for (const win of windows) {
      win.webContents.send('file-changed', siteId)
    }
  })
}
