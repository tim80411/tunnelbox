import { ipcMain, dialog, shell, BrowserWindow } from 'electron'
import { ServerManager } from './server-manager'
import * as siteStore from './store'
import type { TunnelProviderManager } from './tunnel-provider-manager'
import type { SiteInfo, CloudflaredEnv } from '../shared/types'
import { initSiteActions } from './site-actions'

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
  initSiteActions(manager)

  const cfProvider = tunnelManager.get('cloudflare')

  function toSiteInfo(server: {
    id: string
    name: string
    folderPath: string
    port: number
    status: 'running' | 'stopped' | 'error'
  }): SiteInfo {
    const info: SiteInfo = {
      id: server.id,
      name: server.name,
      folderPath: server.folderPath,
      port: server.port,
      status: server.status,
      url: server.status === 'running' ? `http://localhost:${server.port}` : ''
    }
    const providerInfo = tunnelManager.getTunnelInfoAcrossProviders(server.id)
    if (providerInfo) {
      info.tunnel = {
        type:
          providerInfo.providerType === 'cloudflare'
            ? providerInfo.tunnelId
              ? 'named'
              : 'quick'
            : 'quick',
        status: providerInfo.status,
        publicUrl: providerInfo.publicUrl,
        tunnelId: providerInfo.tunnelId,
        errorMessage: providerInfo.errorMessage
      }
    }
    return info
  }

  function broadcastSiteUpdate(): void {
    const sites = serverManager.getServers().map(toSiteInfo)
    const windows = BrowserWindow.getAllWindows()
    for (const win of windows) {
      win.webContents.send('site-updated', sites)
    }
  }

  // --- Site Management ---

  ipcMain.handle('add-site', async (_event, name: string, folderPath: string) => {
    try {
      // Validate required fields
      if (!name || !name.trim()) {
        throw new Error('請輸入網頁名稱')
      }
      if (!folderPath || !folderPath.trim()) {
        throw new Error('請選擇資料夾路徑')
      }

      const trimmedName = name.trim()

      // Check duplicate name
      const existingServers = serverManager.getServers()
      if (existingServers.some((s) => s.name === trimmedName)) {
        throw new Error(`名稱「${trimmedName}」已被使用`)
      }

      // Check duplicate path
      if (existingServers.some((s) => s.folderPath === folderPath)) {
        throw new Error('此路徑已被其他網頁使用')
      }

      const id = serverManager.generateId()
      const server = await serverManager.startServer({ id, name: trimmedName, folderPath })

      // Persist to store
      siteStore.addSite({ id, name: trimmedName, folderPath })

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

      await serverManager.startServer({
        id: existing.id,
        name: existing.name,
        folderPath: existing.folderPath
      })
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

  // --- File Change Forwarding ---

  serverManager.onFileChange((siteId) => {
    const windows = BrowserWindow.getAllWindows()
    for (const win of windows) {
      win.webContents.send('file-changed', siteId)
    }
  })
}
