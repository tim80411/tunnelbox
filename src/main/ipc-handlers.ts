import { ipcMain, dialog, shell, BrowserWindow } from 'electron'
import { ServerManager } from './server-manager'
import * as siteStore from './store'
import type { SiteInfo } from '../shared/types'

let serverManager: ServerManager

function toSiteInfo(server: {
  id: string
  name: string
  folderPath: string
  port: number
  status: 'running' | 'stopped' | 'error'
}): SiteInfo {
  return {
    id: server.id,
    name: server.name,
    folderPath: server.folderPath,
    port: server.port,
    status: server.status,
    url: server.status === 'running' ? `http://localhost:${server.port}` : ''
  }
}

function broadcastSiteUpdate(): void {
  const sites = serverManager.getServers().map(toSiteInfo)
  const windows = BrowserWindow.getAllWindows()
  for (const win of windows) {
    win.webContents.send('site-updated', sites)
  }
}

export function getServerManager(): ServerManager {
  return serverManager
}

export function registerIpcHandlers(manager: ServerManager): void {
  serverManager = manager

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

  // --- File Change Forwarding ---

  serverManager.onFileChange((siteId) => {
    const windows = BrowserWindow.getAllWindows()
    for (const win of windows) {
      win.webContents.send('file-changed', siteId)
    }
  })
}
