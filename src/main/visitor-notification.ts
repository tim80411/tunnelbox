import { Notification } from 'electron'
import { createLogger } from './logger'
import { visitorTracker } from './visitor-tracker'
import { getSettings } from './settings-store'
import type { VisitorEvent } from '../shared/types'

const log = createLogger('VisitorNotification')

const BATCH_WINDOW_MS = 10_000 // 10 seconds

interface PendingBatch {
  siteId: string
  siteName: string
  visitors: string[] // IP list
  timer: ReturnType<typeof setTimeout>
}

let pendingBatches: Map<string, PendingBatch> = new Map()
let unsubscribe: (() => void) | null = null

function formatTime(ts: number): string {
  const d = new Date(ts)
  return d.toLocaleTimeString()
}

function showNotification(title: string, body: string): void {
  try {
    if (!Notification.isSupported()) {
      log.warn('OS notifications not supported')
      return
    }
    const notification = new Notification({ title, body, silent: false })
    notification.show()
  } catch (err) {
    log.error('Failed to show notification:', err)
  }
}

function flushBatch(siteId: string): void {
  const batch = pendingBatches.get(siteId)
  if (!batch) return
  pendingBatches.delete(siteId)

  const uniqueIps = [...new Set(batch.visitors)]
  if (uniqueIps.length === 1) {
    showNotification(
      `Visitor on ${batch.siteName}`,
      `${uniqueIps[0]} is browsing your site`
    )
  } else {
    showNotification(
      `${uniqueIps.length} visitors on ${batch.siteName}`,
      `${uniqueIps.join(', ')}`
    )
  }
}

function handleVisitorEvent(event: VisitorEvent): void {
  // Check if notifications are enabled
  const settings = getSettings()
  if (!settings.visitorNotifications) return

  const existing = pendingBatches.get(event.siteId)
  if (existing) {
    existing.visitors.push(event.visitorIp)
    // Timer is already running; it will flush when it fires
    return
  }

  // Start a new batch
  const timer = setTimeout(() => {
    flushBatch(event.siteId)
  }, BATCH_WINDOW_MS)

  pendingBatches.set(event.siteId, {
    siteId: event.siteId,
    siteName: event.siteName,
    visitors: [event.visitorIp],
    timer
  })

  // Show an immediate notification for the first visitor
  showNotification(
    `Visitor on ${event.siteName}`,
    `${event.visitorIp} at ${formatTime(event.timestamp)}`
  )
}

/**
 * Start listening for visitor events and showing OS notifications.
 * Safe to call multiple times; subsequent calls are no-ops.
 */
export function initVisitorNotifications(): void {
  if (unsubscribe) return
  visitorTracker.on('visitor', handleVisitorEvent)
  unsubscribe = () => {
    visitorTracker.off('visitor', handleVisitorEvent)
  }
  log.info('Visitor notifications initialized')
}

/**
 * Stop listening and clear any pending batches.
 */
export function stopVisitorNotifications(): void {
  if (unsubscribe) {
    unsubscribe()
    unsubscribe = null
  }
  for (const batch of pendingBatches.values()) {
    clearTimeout(batch.timer)
  }
  pendingBatches.clear()
}

/**
 * Expose for testing: force-flush all pending batches.
 */
export function _flushAllBatches(): void {
  for (const siteId of [...pendingBatches.keys()]) {
    const batch = pendingBatches.get(siteId)
    if (batch) clearTimeout(batch.timer)
    flushBatch(siteId)
  }
}

/**
 * Expose for testing: get the pending batches map.
 */
export function _getPendingBatches(): Map<string, PendingBatch> {
  return pendingBatches
}

/**
 * Expose for testing: reset state.
 */
export function _reset(): void {
  stopVisitorNotifications()
  pendingBatches = new Map()
}
