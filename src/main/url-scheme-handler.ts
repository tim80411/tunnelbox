import path from 'node:path'
import os from 'node:os'
import { app, BrowserWindow, dialog } from 'electron'
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
 * - Windows & Linux: URL arrives via process.argv (cold start) or `second-instance` event (warm start)
 * Must be called before app.whenReady().
 */
export function setupOpenUrlHandler(): void {
  // macOS: open-url event
  app.on('open-url', (event, url) => {
    event.preventDefault()
    log.info(`Received URL (open-url): ${url}`)
    handleIncomingUrl(url)
  })

  // Windows & Linux: second-instance event (app already running, new instance launched with URL)
  app.on('second-instance', (_event, argv) => {
    log.info('Second instance detected')
    const url = findTunnelboxUrl(argv)
    if (url) {
      log.info(`Received URL (second-instance): ${url}`)
      handleIncomingUrl(url)
    }
  })

  // Windows & Linux: cold start — check process.argv for a tunnelbox:// URL
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

/** Directory names considered sensitive and never allowed to be served. */
const SENSITIVE_DIRS = ['.ssh', '.gnupg', '.aws', '.azure', '.config', '.kube', '.docker', '.npmrc', '.env', '.git']

/**
 * Validate that the resolved path is safe to serve.
 * Returns an error message if the path is rejected, or `null` if it is allowed.
 */
export function validateServePath(rawPath: string): string | null {
  const resolved = path.resolve(rawPath)
  const home = os.homedir()

  // Must be inside the user's home directory
  if (!resolved.startsWith(home + path.sep) && resolved !== home) {
    return `Path is outside your home directory: ${resolved}`
  }

  // Check every segment of the path relative to home for sensitive directory names
  const relative = path.relative(home, resolved)
  const segments = relative.split(path.sep)
  for (const segment of segments) {
    if (SENSITIVE_DIRS.includes(segment)) {
      return `Path contains sensitive directory "${segment}": ${resolved}`
    }
  }

  return null
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

    // Validate path safety
    const validationError = validateServePath(folderPath)
    if (validationError) {
      log.error(`Path validation failed: ${validationError}`)
      broadcastUrlAddResult({ success: false, errorMessage: validationError })
      return
    }

    // Ask the user to confirm before serving this path
    const resolvedPath = path.resolve(folderPath)
    const parentWindow = BrowserWindow.getAllWindows()[0]
    const dialogOptions = {
      type: 'question' as const,
      buttons: ['Cancel', 'Add Site'],
      defaultId: 1,
      cancelId: 0,
      title: 'TunnelBox — Confirm Site',
      message: 'Add this folder as a site?',
      detail: `A website link is asking to serve:\n${resolvedPath}\n\nOnly continue if you trust the source.`
    }
    const { response } = parentWindow
      ? await dialog.showMessageBox(parentWindow, dialogOptions)
      : await dialog.showMessageBox(dialogOptions)

    if (response === 0) {
      log.info('User cancelled URL add')
      broadcastUrlAddResult({ success: false, errorMessage: 'Cancelled by user' })
      return
    }

    log.info(`Adding site from URL: ${resolvedPath}`)
    const siteInfo = await addSiteFromPath(resolvedPath)
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
