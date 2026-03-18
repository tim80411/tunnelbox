import { BrowserWindow } from 'electron'
import { execFile } from 'node:child_process'
import { findBinary } from './detector'
import { getAuthStatus } from './auth-manager'
import * as siteStore from '../store'
import type { DomainBinding } from '../../shared/types'

/** Active domain bindings in memory: siteId -> DomainBinding */
const activeDomainBindings: Map<string, DomainBinding> = new Map()

/** Error patterns for DNS operations */
const DNS_ERRORS: Array<{ pattern: RegExp; message: string }> = [
  { pattern: /not found in your account/i, message: '此網域不在你的 Cloudflare 帳號中，請先將網域的 DNS 託管到 Cloudflare' },
  { pattern: /not.*managed/i, message: '此網域不在你的 Cloudflare 帳號中，請先將網域的 DNS 託管到 Cloudflare' },
  { pattern: /already.*exist/i, message: '此網域已被其他 Tunnel 使用' },
  { pattern: /already.*route/i, message: '此網域已被其他 Tunnel 使用' },
  { pattern: /duplicate/i, message: '此網域已被其他 Tunnel 使用' },
  { pattern: /unauthorized/i, message: '認證已過期，請重新登入' },
  { pattern: /connection refused/i, message: '無法連線至 Cloudflare，請檢查網路連線' }
]

function requireAuth(): void {
  const auth = getAuthStatus()
  if (auth.status !== 'logged_in') {
    throw new Error('請先登入 Cloudflare 帳號')
  }
}

function parseDnsError(output: string): string | null {
  for (const { pattern, message } of DNS_ERRORS) {
    if (pattern.test(output)) return message
  }
  return null
}

function runCloudflared(binaryPath: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(binaryPath, args, { timeout: 30_000 }, (err, stdout, stderr) => {
      if (err) {
        const output = (stderr || stdout || err.message).trim()
        const friendlyMsg = parseDnsError(output)
        reject(new Error(friendlyMsg || `DNS 操作失敗：${output}`))
        return
      }
      resolve((stdout || stderr).trim())
    })
  })
}

/**
 * Bind a custom domain to a named tunnel.
 * Creates a CNAME record via `cloudflared tunnel route dns`.
 */
export async function bindDomain(siteId: string, domain: string): Promise<void> {
  requireAuth()

  const stored = siteStore.getTunnels().find((t) => t.siteId === siteId)
  if (!stored) throw new Error('找不到此網頁的 Named Tunnel，請先建立 Named Tunnel')

  const binaryPath = await findBinary()
  if (!binaryPath) throw new Error('cloudflared 尚未安裝')

  // Set pending status
  const binding: DomainBinding = { domain, status: 'pending' }
  activeDomainBindings.set(siteId, binding)
  broadcastSiteUpdate()

  try {
    await runCloudflared(binaryPath, ['tunnel', 'route', 'dns', stored.tunnelId, domain])

    // Success - mark as active (DNS may still need propagation)
    binding.status = 'active'
    activeDomainBindings.set(siteId, binding)
    siteStore.saveDomainBinding(siteId, domain)
    broadcastSiteUpdate()
  } catch (err) {
    binding.status = 'error'
    binding.errorMessage = err instanceof Error ? err.message : 'DNS 綁定失敗'
    activeDomainBindings.set(siteId, binding)
    broadcastSiteUpdate()
    throw err
  }
}

/**
 * Unbind a custom domain from a named tunnel.
 */
export async function unbindDomain(siteId: string): Promise<void> {
  requireAuth()

  const domainStore = siteStore.getDomainBinding(siteId)
  if (!domainStore) throw new Error('此網頁未綁定自訂網域')

  const stored = siteStore.getTunnels().find((t) => t.siteId === siteId)
  if (!stored) throw new Error('找不到此網頁的 Named Tunnel')

  const binaryPath = await findBinary()
  if (!binaryPath) throw new Error('cloudflared 尚未安裝')

  // Attempt to remove DNS route
  try {
    await runCloudflared(binaryPath, [
      'tunnel',
      'route',
      'dns',
      '--overwrite-dns',
      stored.tunnelId,
      domainStore.domain
    ])
  } catch {
    // Best effort: the route command might not support delete directly
    // The CNAME will become stale when the tunnel is gone
    console.log(`[DnsManager] Could not delete DNS route for ${domainStore.domain}, continuing cleanup`)
  }

  // Clean up local state
  activeDomainBindings.delete(siteId)
  siteStore.removeDomainBinding(siteId)
  broadcastSiteUpdate()
}

/**
 * Get domain binding info for a site.
 */
export function getDomainBindingInfo(siteId: string): DomainBinding | undefined {
  // Check in-memory first, then fall back to store
  const active = activeDomainBindings.get(siteId)
  if (active) return active

  const stored = siteStore.getDomainBinding(siteId)
  if (stored) {
    const binding: DomainBinding = { domain: stored.domain, status: 'active' }
    activeDomainBindings.set(siteId, binding)
    return binding
  }

  return undefined
}

/** Restore domain bindings from store on boot */
export function restoreDomainBindings(): void {
  // Domain bindings are loaded lazily via getDomainBindingInfo
  // No active initialization needed
}

function broadcastSiteUpdate(): void {
  const windows = BrowserWindow.getAllWindows()
  for (const win of windows) {
    // The site update will be triggered by ipc-handlers broadcastSiteUpdate
    // We just need to signal that domain state changed
    win.webContents.send('site-updated', [])
  }
}
