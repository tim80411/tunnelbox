import { app, BrowserWindow, shell } from 'electron'
import path from 'node:path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { ServerManager } from './server-manager'
import {
  ProcessManager,
  initQuickTunnel,
  initNamedTunnel,
  restoreNamedTunnels,
  stopAllNamedTunnels,
  stopAllQuickTunnels
} from './cloudflared'
import { registerIpcHandlers } from './ipc-handlers'
import { registerQuickActionHandlers } from './quick-action-installer'
import { registerProtocolClient, setupOpenUrlHandler, flushPendingUrl } from './url-scheme-handler'
import { createLogger } from './logger'
import * as siteStore from './store'

const log = createLogger('Main')

let mainWindow: BrowserWindow | null = null
const serverManager = new ServerManager()
export const processManager = new ProcessManager()
initQuickTunnel(processManager)
initNamedTunnel(processManager)

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    minWidth: 600,
    minHeight: 400,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
    flushPendingUrl()
  })

  // Forward Cmd+V / Ctrl+V to renderer for paste-to-add feature
  mainWindow.webContents.on('before-input-event', (_event, input) => {
    if ((input.meta || input.control) && input.key.toLowerCase() === 'v' && input.type === 'keyDown') {
      log.debug('Forwarding paste shortcut to renderer')
      mainWindow?.webContents.send('paste-shortcut')
    }
  })

  // Open external links in default browser instead of new Electron window
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  // Load renderer
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

// ---------- URL Scheme Registration (must be before app.whenReady) ----------

registerProtocolClient()
setupOpenUrlHandler()

// ---------- App Lifecycle ----------

app.whenReady().then(async () => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.tunnelbox')

  // Default open or close DevTools by F12 in development
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  try {
    // Initialize WebSocket server for hot reload
    await serverManager.initWebSocket()

    // Register IPC handlers
    registerIpcHandlers(serverManager)
    registerQuickActionHandlers()

    // Restore sites from persistent store
    const storedSites = siteStore.getSites()
    for (const site of storedSites) {
      try {
        await serverManager.startServer({
          id: site.id,
          name: site.name,
          folderPath: site.folderPath
        })
        log.info(`Restored and started server for "${site.name}"`)
      } catch (err) {
        log.error(`Failed to restore server for "${site.name}":`, err)
        // Register as stopped so it still shows in the list
        serverManager.registerStopped(site)
      }
    }

    // Restore named tunnels (Story 27: auto-reconnect on boot)
    restoreNamedTunnels((siteId) => {
      const server = serverManager.getServer(siteId)
      return server && server.status === 'running' ? server.port : null
    }).catch((err) => {
      log.error('Failed to restore named tunnels:', err)
    })

    createWindow()
  } catch (err) {
    log.error('Failed to initialize application:', err)
    // Show error window if initialization fails
    const errorWin = new BrowserWindow({
      width: 400,
      height: 200,
      webPreferences: { nodeIntegration: false, contextIsolation: true }
    })
    errorWin.loadURL(
      `data:text/html,<html><body style="font-family:sans-serif;padding:20px;">
        <h2>Startup Error</h2>
        <p>${err instanceof Error ? err.message : 'Unknown error during startup'}</p>
      </body></html>`
    )
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

// ---------- Cleanup on Quit ----------

let isQuitting = false

app.on('before-quit', (e) => {
  if (isQuitting) return
  isQuitting = true
  e.preventDefault()

  log.info('Application quitting, stopping all servers and tunnel processes...')

  // Mark all tunnels as stopped first (prevents reconnect timers)
  stopAllNamedTunnels()
  stopAllQuickTunnels()

  // Force exit after 5 seconds no matter what
  const forceExitTimer = setTimeout(() => {
    log.info('Cleanup timeout, forcing exit')
    app.exit(0)
  }, 5000)
  forceExitTimer.unref()

  // Clean up processes and servers, then exit
  Promise.allSettled([processManager.killAll(), serverManager.stopAll()]).then(() => {
    clearTimeout(forceExitTimer)
    app.exit(0)
  })
})

app.on('window-all-closed', () => {
  // On macOS, quit when all windows closed (for this app)
  app.quit()
})

// ---------- Handle forced termination ----------

process.on('exit', () => {
  // Synchronous cleanup: force kill any remaining servers
  try {
    const servers = serverManager.getServers()
    for (const server of servers) {
      if (server.httpServer) {
        server.httpServer.close()
      }
      if (server.watcher) {
        server.watcher.close()
      }
    }
  } catch {
    // Best effort on exit
  }
})

process.on('SIGTERM', () => {
  log.info('Received SIGTERM, cleaning up...')
  Promise.allSettled([processManager.killAll(), serverManager.stopAll()]).finally(() => {
    process.exit(0)
  })
})

process.on('SIGINT', () => {
  log.info('Received SIGINT, cleaning up...')
  Promise.allSettled([processManager.killAll(), serverManager.stopAll()]).finally(() => {
    process.exit(0)
  })
})
