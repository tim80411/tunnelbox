import { ipcMain, dialog, shell, BrowserWindow } from 'electron'
import { ServerManager } from './server-manager'
import * as siteStore from './store'
import type { TunnelProviderManager } from './tunnel-provider-manager'
import { DOMAIN_REGEX } from '../shared/types'
import type { SiteInfo, CloudflaredEnv, AddSiteParams } from '../shared/types'
import type { SiteServer } from './server-manager'
import { initSiteActions } from './site-actions'
import { getAllLanIps, isVpnInterface } from '../core/lan-ip'

let serverManager: ServerManager


function broadcastCloudflaredStatus(env: CloudflaredEnv): void {
  const windows = BrowserWindow.getAllWindows()
  for (const win of windows) {
    win.webContents.send('cloudflared-status-changed', env)
  }
}

export function getServerManager(): ServerManager {
  return serverManager
}

export function registerIpcHandlers(
  manager: ServerManager,
  tunnelManager: TunnelProviderManager
): void {
  serverManager = manager
  initSiteActions(manager, tunnelManager)

  const cfProvider = tunnelManager.get('cloudflare')

  function toSiteInfo(
    server: SiteServer,
    lanIps?: Array<{ name: string; ip: string }>,
    storedSites?: import('../shared/types').StoredSite[]
  ): SiteInfo {
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
    const allStored = storedSites ?? siteStore.getSites()
    const storedSite = allStored.find((s) => s.id === server.id)
    const base = {
      id: server.id,
      name: server.name,
      port: server.port,
      status: server.status,
      url: server.status === 'running' ? `http://localhost:${server.port}` : '',
      ...(tunnel && { tunnel }),
      ...(storedSite?.defaultDomain && { defaultDomain: storedSite.defaultDomain })
    }

    // LAN URL — always computed for running sites
    if (server.status === 'running') {
      const ips = lanIps ?? getAllLanIps()
      if (ips.length > 0) {
        ;(base as any).lanUrl = `http://${ips[0].ip}:${server.port}`
        ;(base as any).lanInterfaceName = ips[0].name
        const nonVpnCount = ips.filter((i) => !isVpnInterface(i.name)).length
        ;(base as any).lanHasMultipleInterfaces = nonVpnCount > 1
      }
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
    const lanIps = getAllLanIps()
    const storedSites = siteStore.getSites()
    const sites = serverManager.getServers().map((s) => toSiteInfo(s, lanIps, storedSites))
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
      await serverManager.removeServer(id)
      siteStore.removeSite(id)

      broadcastSiteUpdate()
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : 'Failed to remove site')
    }
  })

  ipcMain.handle('rename-site', async (_event, id: string, newName: string) => {
    try {
      const trimmed = newName.trim()
      if (!trimmed) throw new Error('請輸入網頁名稱')

      const existingServers = serverManager.getServers()
      if (existingServers.some((s) => s.id !== id && s.name === trimmed)) {
        throw new Error(`名稱「${trimmed}」已被使用`)
      }

      const server = serverManager.getServer(id)
      if (!server) throw new Error(`Site not found: ${id}`)

      // Update runtime
      server.name = trimmed
      // Update store
      siteStore.updateSite(id, { name: trimmed })

      broadcastSiteUpdate()
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : 'Failed to rename site')
    }
  })

  ipcMain.handle('get-sites', async () => {
    try {
      const storedSites = siteStore.getSites()
      return serverManager.getServers().map((s) => toSiteInfo(s, undefined, storedSites))
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

  ipcMain.handle('refresh-lan', async () => {
    try {
      broadcastSiteUpdate()
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : '重新偵測區網失敗')
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

  // --- Default Domain ---

  ipcMain.handle('set-default-domain', async (_event, siteId: string, domain: string) => {
    try {
      if (typeof siteId !== 'string' || !siteId) throw new Error('Invalid siteId')
      if (typeof domain !== 'string' || !domain.trim()) throw new Error('Invalid domain')
      const trimmed = domain.trim()
      if (!DOMAIN_REGEX.test(trimmed)) {
        throw new Error('Invalid domain format')
      }
      siteStore.updateSite(siteId, { defaultDomain: trimmed })
      broadcastSiteUpdate()
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : '設定預設網域失敗')
    }
  })

  ipcMain.handle('clear-default-domain', async (_event, siteId: string) => {
    try {
      if (typeof siteId !== 'string' || !siteId) throw new Error('Invalid siteId')
      siteStore.updateSite(siteId, { defaultDomain: undefined })
      broadcastSiteUpdate()
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : '清除預設網域失敗')
    }
  })

  // --- File Change Forwarding ---

  serverManager.onFileChange((siteId) => {
    const windows = BrowserWindow.getAllWindows()
    for (const win of windows) {
      win.webContents.send('file-changed', siteId)
    }
  })

  // --- Proxy Status Change Forwarding ---

  serverManager.onStatusChange(() => {
    broadcastSiteUpdate()
  })
}
