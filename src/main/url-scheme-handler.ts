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
 * Set up URL event listeners for all platforms.
 * - macOS: `open-url` event
 * - Windows: URL arrives via process.argv (cold start) or `second-instance` event (warm start)
 * Must be called before app.whenReady().
 */
export function setupOpenUrlHandler(): void {
  // macOS: open-url event
  app.on('open-url', (event, url) => {
    event.preventDefault()
    log.info(`Received URL (open-url): ${url}`)
    handleIncomingUrl(url)
  })

  // Windows: second-instance event (app already running, new instance launched with URL)
  app.on('second-instance', (_event, argv) => {
    log.info('Second instance detected')
    const url = findTunnelboxUrl(argv)
    if (url) {
      log.info(`Received URL (second-instance): ${url}`)
      handleIncomingUrl(url)
    }
  })

  // Windows: cold start — check process.argv for a tunnelbox:// URL
  const coldStartUrl = findTunnelboxUrl(process.argv)
  if (coldStartUrl) {
    log.info(`Found URL in process.argv: ${coldStartUrl}`)
    pendingUrl = coldStartUrl
  }
}

/**
 * Process any queued URL and switch to live mode.
 * Call after IPC handlers are registered and the window is shown.
 * This is the single transition point — all future URL events are processed immediately.
 */
export function flushPendingUrl(): void {
  isReady = true
  if (pendingUrl) {
    const url = pendingUrl
    pendingUrl = null
    processUrl(url)
  }
}

function handleIncomingUrl(url: string): void {
  if (isReady) {
    processUrl(url)
  } else {
    pendingUrl = url
    log.info('App not ready yet, queuing URL')
  }
}

/**
 * Find a tunnelbox:// URL in an argv array.
 */
function findTunnelboxUrl(argv: string[]): string | null {
  return argv.find((arg) => arg.startsWith('tunnelbox://')) ?? null
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
