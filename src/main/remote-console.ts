import { ipcMain, BrowserWindow } from 'electron'
import type { WebSocket } from 'ws'
import { createLogger } from './logger'
import { getSettings } from './settings-store'
import type { ServerManager } from './server-manager'
import type { RemoteConsoleEntry } from '../shared/types'

const log = createLogger('RemoteConsole')

const RING_BUFFER_LIMIT = 500
const THROTTLE_INTERVAL_MS = 100 // min ms between broadcasts

/** Per-site ring buffer of console entries. */
const buffers: Map<string, RemoteConsoleEntry[]> = new Map()

/** Timestamp of last broadcast per siteId, used for throttling. */
const lastBroadcast: Map<string, number> = new Map()

/** Pending throttle timers per siteId. */
const throttleTimers: Map<string, ReturnType<typeof setTimeout>> = new Map()

function getBuffer(siteId: string): RemoteConsoleEntry[] {
  let buf = buffers.get(siteId)
  if (!buf) {
    buf = []
    buffers.set(siteId, buf)
  }
  return buf
}

function pushEntry(entry: RemoteConsoleEntry): void {
  const buf = getBuffer(entry.siteId)
  buf.push(entry)
  // Ring buffer: drop oldest when over limit
  if (buf.length > RING_BUFFER_LIMIT) {
    buf.splice(0, buf.length - RING_BUFFER_LIMIT)
  }
}

function broadcastEntry(entry: RemoteConsoleEntry): void {
  const windows = BrowserWindow.getAllWindows()
  for (const win of windows) {
    win.webContents.send('remote-console-entry', entry)
  }
}

function throttledBroadcast(entry: RemoteConsoleEntry): void {
  const siteId = entry.siteId
  const now = Date.now()
  const last = lastBroadcast.get(siteId) || 0

  if (now - last >= THROTTLE_INTERVAL_MS) {
    lastBroadcast.set(siteId, now)
    broadcastEntry(entry)
    return
  }

  // Throttle: schedule broadcast if not already scheduled
  if (!throttleTimers.has(siteId)) {
    const timer = setTimeout(() => {
      throttleTimers.delete(siteId)
      lastBroadcast.set(siteId, Date.now())
      broadcastEntry(entry)
    }, THROTTLE_INTERVAL_MS - (now - last))
    throttleTimers.set(siteId, timer)
  }
}

/**
 * Handle an incoming WebSocket message that may be a console forwarding payload.
 * Returns true if the message was handled as a console entry.
 */
export function handleConsoleMessage(data: string, siteId: string): boolean {
  const settings = getSettings()
  if (!settings.remoteConsoleEnabled) return false

  try {
    const parsed = JSON.parse(data)
    if (parsed.type !== 'console') return false

    const level = parsed.level
    if (level !== 'log' && level !== 'warn' && level !== 'error') return false

    const entry: RemoteConsoleEntry = {
      type: 'console',
      level,
      args: Array.isArray(parsed.args) ? parsed.args : [parsed.args],
      timestamp: typeof parsed.timestamp === 'number' ? parsed.timestamp : Date.now(),
      sessionId: typeof parsed.sessionId === 'string' ? parsed.sessionId : 'unknown',
      siteId
    }

    pushEntry(entry)
    throttledBroadcast(entry)
    return true
  } catch {
    return false
  }
}

/**
 * Register IPC handlers for the renderer to query console logs.
 */
export function registerRemoteConsoleIpc(): void {
  ipcMain.handle('get-remote-console-logs', (_event, siteId: string) => {
    return getBuffer(siteId).slice()
  })

  ipcMain.handle('clear-remote-console-logs', (_event, siteId: string) => {
    buffers.delete(siteId)
  })
}

/**
 * Attach console message handling to the ServerManager's WebSocket server.
 * This hooks into existing WS connections used for hot reload.
 */
export function initRemoteConsole(serverManager: ServerManager): void {
  // The ServerManager exposes wsClients after initWebSocket().
  // We monkey-patch the global WS server's 'connection' event to also handle
  // console messages. Since the server-manager already sets up 'connection',
  // we use a second listener that adds a 'message' handler.
  const wsServer = (serverManager as unknown as { globalWsServer: import('ws').WebSocketServer | null }).globalWsServer
  if (!wsServer) {
    log.warn('WebSocket server not initialized, remote console disabled')
    return
  }

  wsServer.on('connection', (ws: WebSocket, req) => {
    const url = new URL(req.url || '/', `http://localhost`)
    const siteId = url.searchParams.get('siteId') || ''

    ws.on('message', (rawData) => {
      try {
        const data = typeof rawData === 'string' ? rawData : rawData.toString()
        handleConsoleMessage(data, siteId)
      } catch (err) {
        log.error('Error processing WS message:', err)
      }
    })
  })

  log.info('Remote console initialized')
}

/** Expose for testing. */
export function _getBuffers(): Map<string, RemoteConsoleEntry[]> {
  return buffers
}

/** Expose for testing. */
export function _clearAll(): void {
  buffers.clear()
  lastBroadcast.clear()
  for (const timer of throttleTimers.values()) {
    clearTimeout(timer)
  }
  throttleTimers.clear()
}
