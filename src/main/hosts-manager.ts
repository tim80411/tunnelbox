/**
 * hosts-manager.ts — Manage /etc/hosts entries for TunnelBox local domains.
 *
 * - Reads and writes /etc/hosts using a TunnelBox marker comment block.
 * - Uses `osascript` (macOS) for privilege escalation when writing.
 * - macOS only (process.platform === 'darwin').
 */

import fs from 'node:fs'
import { execSync } from 'node:child_process'
import { createLogger } from './logger'

const log = createLogger('HostsManager')

const HOSTS_PATH = '/etc/hosts'
const MARKER_BEGIN = '# TunnelBox — BEGIN'
const MARKER_END = '# TunnelBox — END'

export interface HostsEntry {
  domain: string
  ip: string
}

/**
 * Parse the TunnelBox-managed entries from /etc/hosts.
 */
export function readTunnelBoxEntries(): HostsEntry[] {
  try {
    const content = fs.readFileSync(HOSTS_PATH, 'utf-8')
    const lines = content.split('\n')
    const entries: HostsEntry[] = []

    let inBlock = false
    for (const line of lines) {
      if (line.trim() === MARKER_BEGIN) {
        inBlock = true
        continue
      }
      if (line.trim() === MARKER_END) {
        inBlock = false
        continue
      }
      if (inBlock) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('#')) continue
        const parts = trimmed.split(/\s+/)
        if (parts.length >= 2) {
          entries.push({ ip: parts[0], domain: parts[1] })
        }
      }
    }

    return entries
  } catch (err) {
    log.error('Failed to read hosts file:', err)
    return []
  }
}

/**
 * Check if a domain exists in /etc/hosts OUTSIDE the TunnelBox block
 * (i.e., managed by another program).
 */
export function isDomainManagedExternally(domain: string): boolean {
  try {
    const content = fs.readFileSync(HOSTS_PATH, 'utf-8')
    const lines = content.split('\n')

    let inBlock = false
    for (const line of lines) {
      if (line.trim() === MARKER_BEGIN) {
        inBlock = true
        continue
      }
      if (line.trim() === MARKER_END) {
        inBlock = false
        continue
      }
      if (!inBlock) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('#')) continue
        const parts = trimmed.split(/\s+/)
        if (parts.length >= 2 && parts[1] === domain) {
          return true
        }
      }
    }

    return false
  } catch {
    return false
  }
}

/**
 * Build the new /etc/hosts content with TunnelBox entries updated.
 */
function buildHostsContent(entries: HostsEntry[]): string {
  let content: string
  try {
    content = fs.readFileSync(HOSTS_PATH, 'utf-8')
  } catch {
    content = ''
  }

  // Remove existing TunnelBox block
  const lines = content.split('\n')
  const newLines: string[] = []
  let inBlock = false

  for (const line of lines) {
    if (line.trim() === MARKER_BEGIN) {
      inBlock = true
      continue
    }
    if (line.trim() === MARKER_END) {
      inBlock = false
      continue
    }
    if (!inBlock) {
      newLines.push(line)
    }
  }

  // Remove trailing empty lines from existing content
  while (newLines.length > 0 && newLines[newLines.length - 1].trim() === '') {
    newLines.pop()
  }

  // Add TunnelBox block if there are entries
  if (entries.length > 0) {
    newLines.push('')
    newLines.push(MARKER_BEGIN)
    for (const entry of entries) {
      newLines.push(`${entry.ip}\t${entry.domain}`)
    }
    newLines.push(MARKER_END)
  }

  newLines.push('') // trailing newline
  return newLines.join('\n')
}

/**
 * Write the hosts file using osascript for privilege escalation (macOS).
 * Throws if the user cancels or the write fails.
 */
function writeHostsWithSudo(newContent: string): void {
  if (process.platform !== 'darwin') {
    throw new Error('hosts 檔案管理目前僅支援 macOS')
  }

  // Use osascript to run a shell command with admin privileges.
  // The content is written to a temp file first, then copied over /etc/hosts.
  const tmpPath = '/tmp/tunnelbox-hosts-' + Date.now()

  try {
    fs.writeFileSync(tmpPath, newContent, 'utf-8')

    const script = `do shell script "cp ${tmpPath} ${HOSTS_PATH}" with administrator privileges`
    execSync(`osascript -e '${script}'`, {
      timeout: 30000,
      stdio: 'pipe'
    })

    log.info('Successfully updated /etc/hosts')
  } finally {
    // Clean up temp file
    try {
      fs.unlinkSync(tmpPath)
    } catch {
      // ignore
    }
  }
}

/**
 * Add a domain entry to /etc/hosts, pointing to 127.0.0.1.
 * Prompts for admin password via osascript on macOS.
 */
export function addHostsEntry(domain: string): void {
  const existing = readTunnelBoxEntries()

  // Check if already present
  if (existing.some((e) => e.domain === domain)) {
    log.info(`Domain ${domain} already in hosts file, skipping`)
    return
  }

  const entries = [...existing, { ip: '127.0.0.1', domain }]
  const newContent = buildHostsContent(entries)
  writeHostsWithSudo(newContent)
}

/**
 * Remove a domain entry from /etc/hosts.
 * Prompts for admin password via osascript on macOS.
 */
export function removeHostsEntry(domain: string): void {
  const existing = readTunnelBoxEntries()
  const filtered = existing.filter((e) => e.domain !== domain)

  // If nothing to remove, skip
  if (filtered.length === existing.length) {
    log.info(`Domain ${domain} not found in TunnelBox hosts block, skipping`)
    return
  }

  const newContent = buildHostsContent(filtered)
  writeHostsWithSudo(newContent)
}

/**
 * Remove all TunnelBox entries from /etc/hosts.
 * Used during cleanup. Silently ignores errors.
 */
export function removeAllHostsEntries(): void {
  try {
    const existing = readTunnelBoxEntries()
    if (existing.length === 0) return

    const newContent = buildHostsContent([])
    writeHostsWithSudo(newContent)
  } catch (err) {
    log.warn('Failed to clean up hosts entries:', err)
  }
}

/**
 * Clean up orphaned entries: remove hosts entries for domains
 * that no longer exist in the provided valid domain list.
 */
export function cleanOrphanedEntries(validDomains: string[]): void {
  try {
    const existing = readTunnelBoxEntries()
    const validSet = new Set(validDomains)
    const filtered = existing.filter((e) => validSet.has(e.domain))

    if (filtered.length === existing.length) return // nothing to clean

    log.info(`Cleaning ${existing.length - filtered.length} orphaned hosts entries`)
    const newContent = buildHostsContent(filtered)
    writeHostsWithSudo(newContent)
  } catch (err) {
    log.warn('Failed to clean orphaned hosts entries:', err)
  }
}
