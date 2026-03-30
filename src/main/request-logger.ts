import { BrowserWindow, ipcMain } from 'electron'
import { createLogger } from './logger'
import type { RequestLogEntry } from '../shared/types'

const log = createLogger('RequestLogger')

const DEFAULT_MAX_ENTRIES = 200

const buffers: Map<string, RequestLogEntry[]> = new Map()
let nextId = 1
let initialized = false

function generateId(): string {
  return `reqlog-${nextId++}`
}

function broadcastToAll(channel: string, ...args: unknown[]): void {
  const windows = BrowserWindow.getAllWindows()
  for (const win of windows) {
    win.webContents.send(channel, ...args)
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
  if (buffer.length > DEFAULT_MAX_ENTRIES) {
    buffer.splice(0, buffer.length - DEFAULT_MAX_ENTRIES)
  }

  log.info(`Request logged: ${data.method} ${data.path} ${data.statusCode} (${data.duration}ms) [${data.siteId}]`)
  broadcastToAll('request-log:new', entry)
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
  return buffers.get(siteId) ?? []
}

/** Expose for testing: reset state. */
export function _reset(): void {
  stopRequestLogger()
  buffers.clear()
  nextId = 1
}
