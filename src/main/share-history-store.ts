import Store from 'electron-store'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import { createLogger } from './logger'
import type { ShareRecord } from '../shared/types'

const log = createLogger('ShareHistoryStore')

interface ShareHistorySchema {
  records: ShareRecord[]
}

const store = new Store<ShareHistorySchema>({
  name: 'tunnelbox-share-history',
  defaults: {
    records: []
  }
})

/**
 * Read all records from persistent store.
 * If data is corrupted, reset to empty and log the error.
 */
function readRecords(): ShareRecord[] {
  try {
    const records = store.get('records')
    if (!Array.isArray(records)) {
      log.error('Share history data corrupted (not an array), resetting to empty')
      store.set('records', [])
      return []
    }
    return records
  } catch (err) {
    log.error('Failed to read share history, resetting to empty:', err)
    store.set('records', [])
    return []
  }
}

/**
 * Write records to persistent store.
 */
function writeRecords(records: ShareRecord[]): void {
  try {
    store.set('records', records)
  } catch (err) {
    log.error('Failed to write share history:', err)
  }
}

/**
 * Create a new share record when a tunnel starts.
 */
export function startRecord(
  siteInfo: { id: string; name: string; sitePath: string },
  tunnelUrl: string,
  providerType: string
): ShareRecord {
  const record: ShareRecord = {
    id: randomUUID(),
    siteId: siteInfo.id,
    siteName: siteInfo.name,
    sitePath: siteInfo.sitePath,
    tunnelUrl,
    providerType,
    startedAt: new Date().toISOString(),
    endedAt: null,
    abnormalEnd: false
  }

  const records = readRecords()
  records.push(record)
  writeRecords(records)

  log.info(`Share record started: site="${siteInfo.name}" url="${tunnelUrl}" provider="${providerType}"`)
  return record
}

/**
 * End a share record when a tunnel stops.
 * Finds the latest in-progress record for the given siteId and sets endedAt.
 */
export function endRecord(siteId: string): void {
  const records = readRecords()
  // Find the latest in-progress record for this site
  let found = false
  for (let i = records.length - 1; i >= 0; i--) {
    if (records[i].siteId === siteId && records[i].endedAt === null) {
      records[i].endedAt = new Date().toISOString()
      found = true
      break
    }
  }
  if (found) {
    writeRecords(records)
    log.info(`Share record ended for siteId="${siteId}"`)
  }
}

/**
 * Get all records, sorted by startedAt descending (newest first).
 * In-progress records (endedAt === null) come before ended records.
 */
export function getRecords(): ShareRecord[] {
  const records = readRecords()
  return records.sort((a, b) => {
    // In-progress records first
    if (a.endedAt === null && b.endedAt !== null) return -1
    if (a.endedAt !== null && b.endedAt === null) return 1
    // Then by startedAt descending
    return new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
  })
}

/**
 * Called on app startup to detect and mark records that ended abnormally.
 * Any record with endedAt === null from a previous session is considered abnormal.
 */
export function markAbnormalEnds(): void {
  const records = readRecords()
  let changed = false
  for (const record of records) {
    if (record.endedAt === null) {
      record.endedAt = new Date().toISOString()
      record.abnormalEnd = true
      changed = true
      log.warn(`Marked share record as abnormal end: site="${record.siteName}" id="${record.id}"`)
    }
  }
  if (changed) {
    writeRecords(records)
  }
}

/**
 * Export all records to CSV at the given file path.
 * Returns true on success.
 */
export function exportToCsv(filePath: string): void {
  const records = getRecords()
  const header = 'Site Name,Site Path,Tunnel URL,Started At,Ended At,Provider,Status'

  const rows = records.map((r) => {
    const status = r.abnormalEnd ? 'Abnormal End' : r.endedAt ? 'Completed' : 'In Progress'
    const startedAt = formatDateTime(r.startedAt)
    const endedAt = r.endedAt ? formatDateTime(r.endedAt) : ''
    return [
      csvEscape(r.siteName),
      csvEscape(r.sitePath),
      csvEscape(r.tunnelUrl),
      csvEscape(startedAt),
      csvEscape(endedAt),
      csvEscape(r.providerType),
      csvEscape(status)
    ].join(',')
  })

  const csv = [header, ...rows].join('\n')

  fs.writeFileSync(filePath, csv, 'utf-8')
  log.info(`Share history exported to "${filePath}" (${records.length} records)`)
}

/**
 * Format ISO 8601 timestamp to human-readable format: "2026-03-27 12:30:00"
 */
function formatDateTime(isoString: string): string {
  const d = new Date(isoString)
  const pad = (n: number): string => n.toString().padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

/**
 * Escape a value for CSV: wrap in quotes if it contains comma, newline, or quote.
 */
function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}
