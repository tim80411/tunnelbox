import { app, BrowserWindow, shell } from 'electron'
import path from 'node:path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { ServerManager } from './server-manager'
import { ProcessManager, initQuickTunnel, initNamedTunnel } from './cloudflared'
import { TunnelProviderManager } from './tunnel-provider-manager'
import { CloudflareProvider } from './providers/cloudflare-provider'
import { FrpProvider } from './providers/frp/frp-provider'
import { BoreProvider } from './providers/bore/bore-provider'
import { registerIpcHandlers } from './ipc-handlers'
import { initApiServer, stopApiServer } from './api-server'
import { registerQuickActionHandlers } from './quick-action-installer'
import { registerProtocolClient, setupOpenUrlHandler, flushPendingUrl } from './url-scheme-handler'
import { createTray, destroyTray } from './tray-manager'
import { registerSettingsIpcHandlers } from './settings-ipc-handlers'
import { setAppMenu } from './app-menu'
import { registerUpdaterHandlers } from './updater'
import { initVisitorNotifications } from './visitor-notification'
import { initNotificationCenter } from './notification-center'
import { initRequestLogger } from './request-logger'
import { registerRemoteConsoleIpc } from './remote-console'
import { createLogger } from './logger'
import { isAllowedExternalUrl, isInternalUrl } from './navigation-policy'
import * as siteStore from './store'
import { markAbnormalEnds } from './share-history-store'
import { registerTierGateIpc } from './license/tier-gate-ipc'
import { registerLicenseImportIpc } from './license/import-ipc'
import { tierGate } from './license/tier-gate'
import { FREE_SHARE_LIMIT } from './concurrent-share-gate'
import { attachCloseHandler, watchTierForDowngrade } from './window-close-handler'
import { startRendererSleepTracking, wakeRenderer } from './renderer-sleep-manager'
import { getSettings } from './settings-store'

const log = createLogger('Main')

let mainWindow: BrowserWindow | null = null
const serverManager = new ServerManager()
export const processManager = new ProcessManager()
initQuickTunnel(processManager)
initNamedTunnel(processManager)

const tunnelManager = new TunnelProviderManager()
tunnelManager.register(new CloudflareProvider())
tunnelManager.register(new FrpProvider(processManager))
tunnelManager.register(new BoreProvider(processManager))

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    minWidth: 600,
    minHeight: 400,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
    flushPendingUrl()
  })

  attachCloseHandler(
    mainWindow,
    () => app.quit(),
    () => {
      mainWindow?.show()
      mainWindow?.webContents.send('open-upgrade-dialog')
    }
  )

  // Forward Cmd+V / Ctrl+V to renderer for paste-to-add feature
  mainWindow.webContents.on('before-input-event', (_event, input) => {
    if ((input.meta || input.control) && input.key.toLowerCase() === 'v' && input.type === 'keyDown') {
      log.debug('Forwarding paste shortcut to renderer')
      mainWindow?.webContents.send('paste-shortcut')
    }
  })

  // TIM-310 (F11/F08): only hand http(s)/mailto URLs to the OS. Blocks file://,
  // smb://, ms-*:, javascript:, custom protocol handlers, etc. that
  // shell.openExternal would otherwise pass straight to the OS handler.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalUrl(url)) {
      shell.openExternal(url)
    } else {
      log.warn(`Blocked window.open to disallowed scheme: ${url}`)
    }
    return { action: 'deny' }
  })

  // TIM-310 (F10): the main window holds the preload bridge and all
  // window.electron.* IPC. Lock it to its own content so it can't be navigated
  // to a remote/attacker origin that would inherit those bridges. Allowed
  // external links are opened in the default browser instead.
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (isInternalUrl(url, process.env['ELECTRON_RENDERER_URL'])) return
    event.preventDefault()
    if (isAllowedExternalUrl(url)) {
      shell.openExternal(url)
    } else {
      log.warn(`Blocked navigation to ${url}`)
    }
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

// Windows & Linux: enforce single instance so second-instance event fires
// instead of opening a duplicate app window
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
}

// ---------- App Lifecycle ----------

app.whenReady().then(async () => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.tunnelbox')

  // Default open or close DevTools by F12 in development
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  try {
    // Mark any share records from previous session as abnormally ended
    markAbnormalEnds()

    // Register IPC handlers
    registerIpcHandlers(serverManager, tunnelManager)
    registerSettingsIpcHandlers()
    registerUpdaterHandlers()
    registerQuickActionHandlers()
    registerRemoteConsoleIpc()
    registerTierGateIpc()
    registerLicenseImportIpc()

    // Load license state into memory before any window opens
    await tierGate.refresh()

    // Initialize visitor notifications, notification center, request logger & remote console
    initVisitorNotifications()
    initNotificationCenter()
    initRequestLogger()

    // Start local HTTP API for CLI communication
    await initApiServer(serverManager, tunnelManager)

    // Restore sites from persistent store.
    // Free users are capped at FREE_SHARE_LIMIT active local servers — restore that many,
    // register the rest as stopped (preserves config, just doesn't auto-start).
    const storedSites = siteStore.getSites()
    const isPro = tierGate.isPro()
    let restoredCount = 0
    for (const site of storedSites) {
      if (!isPro && restoredCount >= FREE_SHARE_LIMIT) {
        serverManager.registerStopped(site)
        log.info(`Free tier limit reached — registering "${site.name}" as stopped`)
        continue
      }
      try {
        await serverManager.startServer(site)
        log.info(`Restored and started server for "${site.name}"`)
        restoredCount++
      } catch (err) {
        log.error(`Failed to restore server for "${site.name}":`, err)
        serverManager.registerStopped(site)
      }
    }

    // Restore named tunnels (Story 27: auto-reconnect on boot) — only for sites whose
    // local server is actually running (others were skipped above due to Free limit).
    await tunnelManager.restoreAll((siteId) => {
      const server = serverManager.getServer(siteId)
      return server && server.status === 'running' ? server.port : null
    }).catch((err) => {
      log.error('Failed to restore named tunnels:', err)
    })

    createWindow()
    setAppMenu()

    // TIM-228: release renderer RAM while the app sleeps in the tray.
    startRendererSleepTracking({ getWindow: () => mainWindow })

    // Create system tray (Story 52: Menu Bar integration)
    createTray(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        // Wake from tray-only sleep (rehydrates the renderer if it was released)
        // then show + focus. Falls through to plain show/focus when not asleep.
        wakeRenderer(() => mainWindow).catch((err) => {
          log.error('wakeRenderer failed:', err)
          mainWindow?.show()
          mainWindow?.focus()
        })
      } else {
        createWindow()
      }
    })

    // Watch for Pro→Free downgrade: bring window to foreground
    watchTierForDowngrade(() => mainWindow)

    // Sync launch-at-startup OS setting on boot (Pro only enforced in UI; setting persisted here)
    // Unsigned dev builds throw on setLoginItemSettings — downgrade to debug log.
    const settings = getSettings()
    try {
      if (tierGate.isPro() && settings.launchAtStartup) {
        app.setLoginItemSettings({ openAtLogin: true, openAsHidden: true })
      } else if (!settings.launchAtStartup) {
        app.setLoginItemSettings({ openAtLogin: false })
      }
    } catch (loginItemErr) {
      log.debug('setLoginItemSettings failed (expected in dev):', loginItemErr)
    }
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
    // In daemon mode (US-221) the hidden window must be explicitly shown on
    // dock-click/re-focus, or the user is locked out with no visible entry point.
    const windows = BrowserWindow.getAllWindows()
    if (windows.length === 0) {
      createWindow()
      return
    }
    // TIM-228: route the main window through wakeRenderer so a dock-click also
    // rehydrates a slept renderer. Other windows just get shown/focused.
    wakeRenderer(() => mainWindow).catch((err) => log.error('wakeRenderer (activate) failed:', err))
    for (const win of windows) {
      if (win === mainWindow) continue
      if (!win.isVisible()) win.show()
      win.focus()
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

  destroyTray()

  // Mark all tunnels as stopped first (prevents reconnect timers)
  tunnelManager.stopAll().catch(() => {})

  // Force exit after 5 seconds no matter what
  const forceExitTimer = setTimeout(() => {
    log.info('Cleanup timeout, forcing exit')
    app.exit(0)
  }, 5000)
  forceExitTimer.unref()

  // Clean up processes, servers, and API server, then exit
  Promise.allSettled([tunnelManager.stopAll(), processManager.killAll(), serverManager.stopAll(), stopApiServer()]).then(() => {
    clearTimeout(forceExitTimer)
    app.exit(0)
  })
})

app.on('window-all-closed', () => {
  // Keep app running in background with tray icon (Story 52)
  // User can quit via tray menu "退出" or Cmd+Q
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
      if (server.serveMode === 'static' && server.watcher) {
        server.watcher.close()
      }
    }
  } catch {
    // Best effort on exit
  }
})

process.on('SIGTERM', () => {
  log.info('Received SIGTERM, cleaning up...')
  Promise.allSettled([tunnelManager.stopAll(), processManager.killAll(), serverManager.stopAll(), stopApiServer()]).finally(() => {
    process.exit(0)
  })
})

process.on('SIGINT', () => {
  log.info('Received SIGINT, cleaning up...')
  Promise.allSettled([tunnelManager.stopAll(), processManager.killAll(), serverManager.stopAll(), stopApiServer()]).finally(() => {
    process.exit(0)
  })
})
