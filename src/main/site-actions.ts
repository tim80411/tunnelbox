import path from 'node:path'
import { BrowserWindow } from 'electron'
import { ServerManager } from './server-manager'
import * as siteStore from './store'
import { getTunnelInfo, getNamedTunnelInfo } from './cloudflared'
import { updateTrayMenu } from './tray-manager'
import type { SiteInfo } from '../shared/types'

let serverManager: ServerManager

export function initSiteActions(manager: ServerManager): void {
  serverManager = manager
}

export function toSiteInfo(server: {
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
  const tunnel = getTunnelInfo(server.id) || getNamedTunnelInfo(server.id)
  if (tunnel) {
    info.tunnel = tunnel
  }
  return info
}

export function broadcastSiteUpdate(): void {
  const sites = serverManager.getServers().map(toSiteInfo)
  const windows = BrowserWindow.getAllWindows()
  for (const win of windows) {
    win.webContents.send('site-updated', sites)
  }
  // Update tray menu with latest site status (Story 53)
  updateTrayMenu(sites)
}

/**
 * Add a site by folder path, auto-deriving the name from the folder basename.
 * Used by the URL scheme handler (Finder right-click integration).
 */
export async function addSiteFromPath(folderPath: string): Promise<SiteInfo> {
  if (!folderPath || !folderPath.trim()) {
    throw new Error('Please provide a folder path')
  }

  const trimmedPath = folderPath.trim()

  if (!path.isAbsolute(trimmedPath)) {
    throw new Error('Path must be absolute')
  }

  const baseName = path.basename(trimmedPath)
  const existingServers = serverManager.getServers()

  // Check duplicate path
  if (existingServers.some((s) => s.folderPath === trimmedPath)) {
    throw new Error('This path is already registered')
  }

  // Derive unique name (append suffix if basename collides)
  let name = baseName
  let suffix = 2
  while (existingServers.some((s) => s.name === name)) {
    name = `${baseName} (${suffix++})`
  }

  const id = serverManager.generateId()
  const server = await serverManager.startServer({ id, name, folderPath: trimmedPath })

  siteStore.addSite({ id, name, folderPath: trimmedPath })

  const info = toSiteInfo(server)
  broadcastSiteUpdate()
  return info
}
