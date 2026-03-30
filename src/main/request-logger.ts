import { BrowserWindow, ipcMain } from 'electron'
import { createLogger } from './logger'
import { getSettings } from './settings-store'
import type { RequestLogEntry } from '../shared/types'

const log = createLogger('RequestLogger')

const DEFAULT_MAX_ENTRIES = 200
const THROTTLE_INTERVAL_MS = 100 // min ms between broadcasts

const buffers: Map<string, RequestLogEntry[]> = new Map()
let nextId = 1
let initialized = false

/** Pending entries waiting to be broadcast, keyed by siteId. */
const pendingQueues: Map<string, RequestLogEntry[]> = new Map()

/** Timestamp of last broadcast per siteId, used for throttling. */
const lastBroadcast: Map<string, number> = new Map()

/** Pending throttle timers per siteId. */
const throttleTimers: Map<string, ReturnType<typeof setTimeout>> = new Map()

function generateId(): string {
  return `reqlog-${nextId++}`
}

function broadcastToAll(channel: string, ...args: unknown[]): void {
  const windows = BrowserWindow.getAllWindows()
  for (const win of windows) {
    win.webContents.send(channel, ...args)
  }
}

function flushPendingEntries(siteId: string): void {
  const queue = pendingQueues.get(siteId)
  if (!queue || queue.length === 0) return

  for (const entry of queue) {
    broadcastToAll('request-log:new', entry)
  }
  queue.length = 0
  lastBroadcast.set(siteId, Date.now())
}

function scheduleFlush(siteId: string, entry: RequestLogEntry): void {
  let queue = pendingQueues.get(siteId)
  if (!queue) {
    queue = []
    pendingQueues.set(siteId, queue)
  }
  queue.push(entry)

  const now = Date.now()
  const last = lastBroadcast.get(siteId) || 0

  // If enough time has passed, flush immediately
  if (now - last >= THROTTLE_INTERVAL_MS) {
    flushPendingEntries(siteId)
    return
  }

  // Otherwise schedule a flush if not already scheduled
  if (!throttleTimers.has(siteId)) {
    const timer = setTimeout(() => {
      throttleTimers.delete(siteId)
      flushPendingEntries(siteId)
    }, THROTTLE_INTERVAL_MS - (now - last))
    throttleTimers.set(siteId, timer)
  }
}

export function addEntry(data: Omit<RequestLogEntry, 'id'>): void {
  const entry: RequestLogEntry = {
    ...data,
    id: generateId()
  }

  let buffer = buffers.get(data.siteId)
  if (!buffer) {
    buffer = []
    buffers.set(data.siteId, buffer)
  }

  buffer.push(entry)

  // Trim oldest if over limit
  const maxEntries = getSettings().requestLogMaxEntries ?? DEFAULT_MAX_ENTRIES
  if (buffer.length > maxEntries) {
    buffer.splice(0, buffer.length - maxEntries)
  }

  log.info(`Request logged: ${data.method} ${data.path} ${data.statusCode} (${data.duration}ms) [${data.siteId}]`)
  scheduleFlush(data.siteId, entry)
}

export function clearEntries(siteId: string): void {
  buffers.delete(siteId)
  log.info(`Cleared request log for site ${siteId}`)
}

/**
 * Initialize the request logger: register IPC handlers.
 * Safe to call multiple times; subsequent calls are no-ops.
 */
export function initRequestLogger(): void {
  if (initialized) return
  initialized = true

  ipcMain.handle('request-log:get', (_event, siteId: string) => {
    const buffer = buffers.get(siteId) ?? []
    return [...buffer].reverse() // newest first
  })

  ipcMain.handle('request-log:clear', (_event, siteId: string) => {
    clearEntries(siteId)
  })

  log.info('Request logger initialized')
}

/**
 * Stop listening and clean up IPC handlers.
 */
export function stopRequestLogger(): void {
  if (!initialized) return
  initialized = false
  ipcMain.removeHandler('request-log:get')
  ipcMain.removeHandler('request-log:clear')
}

// --- Test helpers ---

/** Expose for testing: get entries for a site. */
export function _getEntries(siteId: string): RequestLogEntry[] {
  return [...(buffers.get(siteId) ?? [])]
}

/** Expose for testing: reset state. */
export function _reset(): void {
  stopRequestLogger()
  buffers.clear()
  nextId = 1
  pendingQueues.clear()
  lastBroadcast.clear()
  for (const timer of throttleTimers.values()) {
    clearTimeout(timer)
  }
  throttleTimers.clear()
}
