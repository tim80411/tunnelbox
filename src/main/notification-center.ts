import { BrowserWindow, ipcMain } from 'electron'
import { createLogger } from './logger'
import { visitorTracker } from './visitor-tracker'
import type { VisitorEvent } from '../shared/types'
import type { NotificationItem } from '../shared/types'

const log = createLogger('NotificationCenter')

let notifications: NotificationItem[] = []
let nextId = 1
let unsubscribe: (() => void) | null = null

function generateId(): string {
  return `notif-${nextId++}`
}

function broadcastToAll(channel: string, ...args: unknown[]): void {
  const windows = BrowserWindow.getAllWindows()
  for (const win of windows) {
    win.webContents.send(channel, ...args)
  }
}

function handleVisitorEvent(event: VisitorEvent): void {
  const item: NotificationItem = {
    id: generateId(),
    siteId: event.siteId,
    siteName: event.siteName,
    visitorIp: event.visitorIp,
    timestamp: event.timestamp,
    read: false
  }

  notifications.push(item)
  log.info(`New notification: visitor ${event.visitorIp} on ${event.siteName}`)

  broadcastToAll('notification-center:new', item)
}

/**
 * Initialize the notification center: subscribe to visitor events
 * and register IPC handlers.
 * Safe to call multiple times; subsequent calls are no-ops.
 */
export function initNotificationCenter(): void {
  if (unsubscribe) return

  visitorTracker.on('visitor', handleVisitorEvent)
  unsubscribe = () => {
    visitorTracker.off('visitor', handleVisitorEvent)
  }

  // --- IPC Handlers ---

  ipcMain.handle('notification-center:get-all', () => {
    return [...notifications].reverse() // newest first
  })

  ipcMain.handle('notification-center:mark-read', (_event, id: string) => {
    const item = notifications.find((n) => n.id === id)
    if (item && !item.read) {
      item.read = true
      broadcastToAll('notification-center:updated', getUnreadCount())
    }
  })

  ipcMain.handle('notification-center:mark-all-read', () => {
    let changed = false
    for (const item of notifications) {
      if (!item.read) {
        item.read = true
        changed = true
      }
    }
    if (changed) {
      broadcastToAll('notification-center:updated', getUnreadCount())
    }
  })

  ipcMain.handle('notification-center:get-unread-count', () => {
    return getUnreadCount()
  })

  log.info('Notification center initialized')
}

function getUnreadCount(): number {
  return notifications.filter((n) => !n.read).length
}

/**
 * Stop listening and clean up IPC handlers.
 */
export function stopNotificationCenter(): void {
  if (unsubscribe) {
    unsubscribe()
    unsubscribe = null
  }
  ipcMain.removeHandler('notification-center:get-all')
  ipcMain.removeHandler('notification-center:mark-read')
  ipcMain.removeHandler('notification-center:mark-all-read')
  ipcMain.removeHandler('notification-center:get-unread-count')
}

// --- Test helpers ---

/** Expose for testing: get all notifications. */
export function _getNotifications(): NotificationItem[] {
  return notifications
}

/** Expose for testing: get unread count. */
export function _getUnreadCount(): number {
  return getUnreadCount()
}

/** Expose for testing: reset state. */
export function _reset(): void {
  stopNotificationCenter()
  notifications = []
  nextId = 1
}
