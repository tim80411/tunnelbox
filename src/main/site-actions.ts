import path from 'node:path'
import { BrowserWindow } from 'electron'
import { ServerManager, type SiteServer } from './server-manager'
import type { TunnelProviderManager } from './tunnel-provider-manager'
import * as siteStore from './store'
import { updateTrayMenu } from './tray-manager'
import type { SiteInfo } from '../shared/types'

let serverManager: ServerManager
let tunnelManager: TunnelProviderManager

export function initSiteActions(manager: ServerManager, tunnel: TunnelProviderManager): void {
  serverManager = manager
  tunnelManager = tunnel
}

export function toSiteInfo(server: SiteServer): SiteInfo {
  const tunnel = getTunnelInfo(server.id) || getNamedTunnelInfo(server.id)
  const base = {
    id: server.id,
    name: server.name,
    port: server.port,
    status: server.status,
    url: server.status === 'running' ? `http://localhost:${server.port}` : '',
    ...(tunnel && { tunnel })
  }
  if (server.serveMode === 'proxy') {
    return { ...base, serveMode: 'proxy' as const, proxyTarget: server.proxyTarget }
  }
  return { ...base, serveMode: 'static' as const, folderPath: server.folderPath }
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
  if (existingServers.some((s) => s.serveMode === 'static' && s.folderPath === trimmedPath)) {
    throw new Error('This path is already registered')
  }

  // Derive unique name (append suffix if basename collides)
  let name = baseName
  let suffix = 2
  while (existingServers.some((s) => s.name === name)) {
    name = `${baseName} (${suffix++})`
  }

  const id = serverManager.generateId()
  const storedSite = { id, name, serveMode: 'static' as const, folderPath: trimmedPath }
  const server = await serverManager.startServer(storedSite)

  siteStore.addSite(storedSite)

  const info = toSiteInfo(server)
  broadcastSiteUpdate()
  return info
}
