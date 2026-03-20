import { app, BrowserWindow } from 'electron'
import { addSiteFromPath } from './site-actions'
import { createLogger } from './logger'
import type { UrlAddResult } from '../shared/types'

const log = createLogger('URLScheme')

let pendingUrl: string | null = null
let isReady = false

/**
 * Register 'tunnelbox://' as a custom protocol.
 * Must be called before app.whenReady().
 * Only registers when packaged (avoids polluting dev environment).
 */
export function registerProtocolClient(): void {
  if (!app.isPackaged) {
    log.warn('Skipping protocol registration in dev mode')
    return
  }
  const success = app.setAsDefaultProtocolClient('tunnelbox')
  if (success) {
    log.info('Registered tunnelbox:// protocol')
  } else {
    log.error('Failed to register tunnelbox:// protocol')
  }
}

/**
 * Set up the open-url event listener.
 * Must be called before app.whenReady().
 * URLs that arrive before the app is ready are queued.
 */
export function setupOpenUrlHandler(): void {
  app.on('open-url', (event, url) => {
    event.preventDefault()
    log.info(`Received URL: ${url}`)

    if (isReady) {
      processUrl(url)
    } else {
      pendingUrl = url
      log.info('App not ready yet, queuing URL')
    }
  })
}

/**
 * Process any queued URL and switch to live mode.
 * Call after IPC handlers are registered and the window is shown.
 * This is the single transition point — all future open-url events are processed immediately.
 */
export function flushPendingUrl(): void {
  isReady = true
  if (pendingUrl) {
    const url = pendingUrl
    pendingUrl = null
    processUrl(url)
  }
}

async function processUrl(url: string): Promise<void> {
  try {
    const parsed = new URL(url)

    if (parsed.hostname !== 'add') {
      log.warn(`Unknown URL action: ${parsed.hostname}`)
      return
    }

    const folderPath = parsed.searchParams.get('path')
    if (!folderPath) {
      log.error('Missing path parameter in URL')
      broadcastUrlAddResult({ success: false, errorMessage: 'Missing path parameter' })
      return
    }

    log.info(`Adding site from URL: ${folderPath}`)
    const siteInfo = await addSiteFromPath(folderPath)
    broadcastUrlAddResult({ success: true, siteName: siteInfo.name })
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Failed to add site'
    log.error(`URL add failed: ${errorMessage}`)
    broadcastUrlAddResult({ success: false, errorMessage })
  } finally {
    focusMainWindow()
  }
}

function focusMainWindow(): void {
  const win = BrowserWindow.getAllWindows()[0]
  if (!win) return
  if (win.isMinimized()) win.restore()
  win.focus()
}

function broadcastUrlAddResult(result: UrlAddResult): void {
  const windows = BrowserWindow.getAllWindows()
  for (const win of windows) {
    win.webContents.send('url-add-result', result)
  }
}
