import { BrowserWindow } from 'electron'
import { execFile } from 'node:child_process'
import { promises as dns } from 'node:dns'
import { ProcessManager } from './process-manager'
import { findBinary } from './detector'
import { getAuthStatus } from './auth-manager'
import { getCertForSite } from './account-manager'
import { stopQuickTunnel, hasTunnel as hasQuickTunnel } from './quick-tunnel'
import { createLogger } from '../logger'
import * as siteStore from '../store'
import type { TunnelInfo, StoredTunnel } from '../../shared/types'
import { waitForTunnelReady } from './tunnel-readiness'
import { translateCloudflaredError, type TranslatedError } from './error-translator'
import { ReconnectWindow } from './reconnect-window'
import { StderrRingBuffer } from './stderr-ring-buffer'

const log = createLogger('NamedTunnel')

/** Active named tunnels in memory: siteId -> TunnelInfo */
const activeNamedTunnels: Map<string, TunnelInfo> = new Map()

/** Track port per site for reconnect */
const namedTunnelPorts: Map<string, number> = new Map()

/** Sliding-window reconnect limiter per site (TIM-222) */
const reconnectWindows: Map<string, ReconnectWindow> = new Map()

/** Ring buffer of recent stderr lines per site, for diagnostics (TIM-222) */
const stderrBuffers: Map<string, StderrRingBuffer> = new Map()

/** Timestamp (ms) of the most recent translated stderr error per running site (TIM-222) */
const lastStderrErrorAt: Map<string, number> = new Map()

/** Stuck-detection timers per site (TIM-222) */
const stuckTimers: Map<string, ReturnType<typeof setInterval>> = new Map()

const BACKOFF_BASE_MS = 2000

/** Sliding-window watchdog config: 5 reconnects within 60s trips a 60s cooldown. */
const MAX_RECONNECT_ATTEMPTS = 5
const RECONNECT_WINDOW_MS = 60_000
const RECONNECT_COOLDOWN_MS = 60_000

/**
 * Stuck detection: if cloudflared keeps logging errors for this long while the
 * tunnel is supposed to be up (without the process exiting), we proactively
 * recycle it to force a clean reconnect.
 */
const STUCK_ERROR_THRESHOLD_MS = 30_000
const STUCK_CHECK_INTERVAL_MS = 5_000

/** DNS CNAME verification after tunnel deletion */
const CNAME_VERIFY_DELAY_MS = 2000
const CNAME_VERIFY_MAX_RETRIES = 2

/** Get (or lazily create) the sliding-window reconnect limiter for a site. */
function getWindow(siteId: string): ReconnectWindow {
  let w = reconnectWindows.get(siteId)
  if (!w) {
    w = new ReconnectWindow({
      maxAttempts: MAX_RECONNECT_ATTEMPTS,
      windowMs: RECONNECT_WINDOW_MS,
      cooldownMs: RECONNECT_COOLDOWN_MS,
      backoffBaseMs: BACKOFF_BASE_MS,
    })
    reconnectWindows.set(siteId, w)
  }
  return w
}

/** Get (or lazily create) the stderr ring buffer for a site. */
function getStderrBuffer(siteId: string): StderrRingBuffer {
  let b = stderrBuffers.get(siteId)
  if (!b) {
    b = new StderrRingBuffer(50)
    stderrBuffers.set(siteId, b)
  }
  return b
}

/**
 * Snapshot of the last ~50 stderr lines for a site, for surfacing in
 * diagnostics / logs (TIM-222). Returns an empty string if nothing buffered.
 */
export function getNamedTunnelStderrSnapshot(siteId: string): string {
  return stderrBuffers.get(siteId)?.snapshot() ?? ''
}

/** Stop the stuck-detection watchdog timer for a site. */
function clearStuckTimer(siteId: string): void {
  const t = stuckTimers.get(siteId)
  if (t) {
    clearInterval(t)
    stuckTimers.delete(siteId)
  }
  lastStderrErrorAt.delete(siteId)
}

/**
 * Start a stuck-detection watchdog: while the tunnel is supposed to be up but
 * cloudflared keeps emitting errors without exiting for STUCK_ERROR_THRESHOLD_MS,
 * proactively recycle the process to force a clean reconnect.
 */
function startStuckWatchdog(siteId: string): void {
  clearStuckTimer(siteId)
  const timer = setInterval(() => {
    const tunnel = activeNamedTunnels.get(siteId)
    if (!tunnel || (tunnel.status !== 'running' && tunnel.status !== 'verifying')) return

    const lastErr = lastStderrErrorAt.get(siteId)
    if (lastErr === undefined) return

    if (Date.now() - lastErr >= STUCK_ERROR_THRESHOLD_MS) {
      log.warn(`Named tunnel ${siteId} appears stuck (prolonged stderr errors, no exit) — recycling`)
      lastStderrErrorAt.delete(siteId)
      // Killing the process triggers the exit handler, which routes to reconnect.
      processManager.kill(`named-tunnel-${siteId}`)
    }
  }, STUCK_CHECK_INTERVAL_MS)
  stuckTimers.set(siteId, timer)
}

/**
 * Verify that the CNAME record for a domain has been removed.
 * Returns true if CNAME is gone (safe), false if it still exists (risk).
 */
async function verifyCnameRemoved(domain: string): Promise<boolean> {
  try {
    const records = await dns.resolveCname(domain)
    return records.length === 0
  } catch (err) {
    // ENOTFOUND / ENODATA means no CNAME exists — this is the expected state
    if (err instanceof Error && 'code' in err) {
      const code = (err as NodeJS.ErrnoException).code
      if (code === 'ENOTFOUND' || code === 'ENODATA') {
        return true
      }
    }
    // Other DNS errors (ETIMEOUT, ESERVFAIL) — treat as uncertain, log and assume unsafe
    log.warn(`DNS lookup error while verifying CNAME removal for ${domain}: ${err instanceof Error ? err.message : String(err)}`)
    return false
  }
}

/** Error patterns for DNS operations */
const DNS_ERRORS: Array<{ pattern: RegExp; message: string }> = [
  { pattern: /not found in your account/i, message: '此網域不在你的 Cloudflare 帳號中，請先將網域的 DNS 託管到 Cloudflare' },
  { pattern: /not.*managed/i, message: '此網域不在你的 Cloudflare 帳號中，請先將網域的 DNS 託管到 Cloudflare' },
  { pattern: /already.*exist/i, message: '此網域已被其他 Tunnel 使用' },
  { pattern: /already.*route/i, message: '此網域已被其他 Tunnel 使用' },
  { pattern: /duplicate/i, message: '此網域已被其他 Tunnel 使用' }
]

function parseDnsError(output: string): string | null {
  for (const { pattern, message } of DNS_ERRORS) {
    if (pattern.test(output)) return message
  }
  return null
}

let processManager: ProcessManager
const lastStderrError: Map<string, TranslatedError> = new Map()

/** Track readiness probe abort controllers */
const readinessAbortControllers: Map<string, AbortController> = new Map()

export function initNamedTunnel(pm: ProcessManager): void {
  processManager = pm

  // Capture stderr into the ring buffer + classify for diagnostics / stuck detection.
  pm.on('stderr', (id: string, data: string) => {
    if (!id.startsWith('named-tunnel-')) return
    const siteId = id.replace('named-tunnel-', '')
    getStderrBuffer(siteId).push(data)

    const translated = translateCloudflaredError(data)
    if (translated.matched) {
      lastStderrError.set(id, translated)
      // Track timing so the stuck watchdog can recycle a wedged-but-alive process.
      const tunnel = activeNamedTunnels.get(siteId)
      if (tunnel && (tunnel.status === 'running' || tunnel.status === 'verifying')) {
        if (!lastStderrErrorAt.has(siteId)) lastStderrErrorAt.set(siteId, Date.now())
      }
    } else if (data.includes('Registered tunnel connection') || data.includes('Connection')) {
      // Healthy signal — clear any pending stuck timer state.
      lastStderrErrorAt.delete(siteId)
    }
  })

  pm.on('exit', (id: string, code: number | null) => {
    if (!id.startsWith('named-tunnel-')) return
    const siteId = id.replace('named-tunnel-', '')
    const tunnel = activeNamedTunnels.get(siteId)
    if (!tunnel) return

    // Cancel any in-flight readiness probe
    readinessAbortControllers.get(siteId)?.abort()
    readinessAbortControllers.delete(siteId)
    lastStderrErrorAt.delete(siteId)

    // If explicitly stopped, don't reconnect
    if (tunnel.status === 'stopped') return

    // Check for auth / quota errors (no reconnect, prompt re-login).
    // Categories come from the central error-translator, so this no longer
    // relies on fragile substring matching of the localized message.
    const stderrError = lastStderrError.get(id)
    lastStderrError.delete(id)

    if (stderrError && (stderrError.category === 'auth' || stderrError.category === 'quota')) {
      tunnel.status = 'error'
      tunnel.errorMessage = stderrError.human
      reconnectWindows.delete(siteId)
      broadcastTunnelStatus(siteId, tunnel)

      // Broadcast auth expired if applicable
      if (stderrError.category === 'auth') {
        broadcastAuthExpired()
      }
      return
    }

    // Unexpected exit with non-zero code -> attempt reconnect (sliding window)
    if (code !== 0 && code !== null) {
      const win = getWindow(siteId)
      const now = Date.now()

      // Still cooling down from a previous trip — stay in error, don't retry yet.
      if (win.isInCooldown(now)) {
        tunnel.status = 'error'
        tunnel.errorMessage = 'Tunnel 連續斷線過於頻繁，已暫停自動重連，請稍後手動重新啟動'
        broadcastTunnelStatus(siteId, tunnel)
        return
      }

      // Too many reconnects inside the window -> trip to error + start cooldown.
      if (win.shouldTrip(now)) {
        win.startCooldown(now)
        tunnel.status = 'error'
        tunnel.errorMessage = 'Tunnel 連續斷線過於頻繁，已暫停自動重連，請稍後手動重新啟動'
        broadcastTunnelStatus(siteId, tunnel)
        return
      }

      attemptReconnect(siteId)
    } else {
      tunnel.status = 'stopped'
      broadcastTunnelStatus(siteId, tunnel)
    }
  })
}

function parseNamedTunnelError(data: string): string | null {
  const translated = translateCloudflaredError(data)
  return translated.matched ? translated.human : null
}

async function attemptReconnect(siteId: string): Promise<void> {
  const port = namedTunnelPorts.get(siteId)
  const stored = siteStore.getTunnels().find((t) => t.siteId === siteId)
  if (!port || !stored) return

  const win = getWindow(siteId)
  const now = Date.now()
  const delay = win.backoffDelay(now)
  win.recordAttempt(now)
  const attempts = win.attemptCount(now)

  const tunnel = activeNamedTunnels.get(siteId)
  if (tunnel) {
    tunnel.status = 'reconnecting'
    tunnel.errorMessage = undefined
    broadcastTunnelStatus(siteId, tunnel)
  }

  log.info(`Reconnecting ${siteId} (attempt ${attempts}/${MAX_RECONNECT_ATTEMPTS} in window) in ${delay}ms`)

  await new Promise((resolve) => setTimeout(resolve, delay))

  // Check if tunnel was stopped during the delay
  const currentTunnel = activeNamedTunnels.get(siteId)
  if (!currentTunnel || currentTunnel.status === 'stopped') return

  try {
    const binaryPath = await findBinary()
    if (!binaryPath) return
    const certPath = getCertForSite(siteId)
    startTunnelProcess(siteId, stored.tunnelId, binaryPath, port, certPath)
  } catch (err) {
    log.error(`Reconnect failed for ${siteId}:`, err)
  }
}

/** Resolve public URL from stored domain binding */
function domainToUrl(siteId: string): string | undefined {
  const d = siteStore.getDomainBinding(siteId)
  return d ? `https://${d.domain}` : undefined
}

function broadcastAuthExpired(): void {
  const windows = BrowserWindow.getAllWindows()
  for (const win of windows) {
    win.webContents.send('auth-status-changed', { status: 'expired' })
  }
}

function requireAuth(): void {
  const auth = getAuthStatus()
  if (auth.status !== 'logged_in') {
    throw new Error('請先登入 Cloudflare 帳號')
  }
}

function runCloudflared(binaryPath: string, args: string[], certPath?: string | null): Promise<string> {
  const finalArgs = certPath ? ['--origincert', certPath, ...args] : args
  return new Promise((resolve, reject) => {
    execFile(binaryPath, finalArgs, { timeout: 30_000 }, (err, stdout, stderr) => {
      if (err) {
        const output = (stderr || stdout || err.message).trim()
        // Map known errors to Chinese messages
        const friendlyMsg = parseNamedTunnelError(output)
        reject(new Error(friendlyMsg || output))
        return
      }
      resolve((stdout || stderr).trim())
    })
  })
}

/**
 * Bind a fixed domain: create tunnel + route DNS + start, all in one step.
 */
export async function bindFixedDomain(
  siteId: string,
  port: number,
  domain: string
): Promise<string> {
  requireAuth()

  const binaryPath = await findBinary()
  if (!binaryPath) throw new Error('cloudflared 尚未安裝')

  const certPath = getCertForSite(siteId)

  // Stop any existing quick tunnel
  if (hasQuickTunnel(siteId)) {
    stopQuickTunnel(siteId)
  }

  const tunnelName = `tunnelbox-${siteId.slice(0, 12)}`

  // Step 1: Create tunnel
  const createOutput = await runCloudflared(binaryPath, ['tunnel', 'create', tunnelName], certPath)
  log.info(`Create output: ${createOutput}`)

  const idMatch =
    createOutput.match(/with id ([a-f0-9-]{36})/i) ||
    createOutput.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i)
  if (!idMatch) {
    throw new Error('無法解析 Tunnel ID')
  }
  const tunnelId = idMatch[1]

  // Step 2: Route DNS (rollback tunnel on failure)
  try {
    await runCloudflared(binaryPath, ['tunnel', 'route', 'dns', tunnelId, domain], certPath)
  } catch (err) {
    // Rollback: delete the just-created tunnel
    try {
      await runCloudflared(binaryPath, ['tunnel', 'delete', tunnelId], certPath)
    } catch {
      log.error(`Rollback: failed to delete tunnel ${tunnelId}`)
    }
    const msg = err instanceof Error ? err.message : String(err)
    throw new Error(parseDnsError(msg) || `DNS 路由失敗：${msg}`)
  }

  // Step 3: Persist
  const stored: StoredTunnel = { siteId, tunnelId, tunnelName }
  siteStore.saveTunnel(stored)
  siteStore.saveDomainBinding(siteId, domain)

  // Step 4: Start tunnel process
  const publicUrl = `https://${domain}`
  const tunnelInfo: TunnelInfo = {
    type: 'named',
    status: 'starting',
    publicUrl,
    tunnelId
  }
  activeNamedTunnels.set(siteId, tunnelInfo)
  namedTunnelPorts.set(siteId, port)
  getWindow(siteId).reset()
  getStderrBuffer(siteId).clear()
  broadcastTunnelStatus(siteId, tunnelInfo)

  startTunnelProcess(siteId, tunnelId, binaryPath, port, certPath)

  return publicUrl
}

/**
 * Unbind fixed domain: stop tunnel + delete from Cloudflare + clean up DNS + local store.
 */
export async function unbindFixedDomain(siteId: string): Promise<void> {
  requireAuth()

  const stored = siteStore.getTunnels().find((t) => t.siteId === siteId)
  if (!stored) throw new Error('找不到此網頁的 Tunnel')

  // Stop if running
  const processId = `named-tunnel-${siteId}`
  if (processManager.isRunning(processId)) {
    processManager.kill(processId)
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }

  // Delete tunnel from Cloudflare (also removes DNS route)
  const binaryPath = await findBinary()
  if (!binaryPath) throw new Error('cloudflared 尚未安裝')

  const certPath = getCertForSite(siteId)

  try {
    await runCloudflared(binaryPath, ['tunnel', 'delete', stored.tunnelId], certPath)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (!msg.includes('not found') && !msg.includes('does not exist') && !msg.includes('already been deleted')) {
      throw new Error(`刪除 Tunnel 失敗：${msg}`)
    }
  }

  // Verify DNS CNAME has been removed to prevent subdomain takeover
  const domainBinding = siteStore.getDomainBinding(siteId)
  if (domainBinding) {
    const domain = domainBinding.domain
    let cnameRemoved = false

    for (let attempt = 0; attempt <= CNAME_VERIFY_MAX_RETRIES; attempt++) {
      // Wait for DNS propagation before checking
      await new Promise((resolve) => setTimeout(resolve, CNAME_VERIFY_DELAY_MS))
      cnameRemoved = await verifyCnameRemoved(domain)
      if (cnameRemoved) {
        log.info(`CNAME record for ${domain} confirmed removed`)
        break
      }
      log.warn(`CNAME record for ${domain} still exists (attempt ${attempt + 1}/${CNAME_VERIFY_MAX_RETRIES + 1})`)
    }

    if (!cnameRemoved) {
      log.warn(
        `[SECURITY] CNAME record for ${domain} was NOT removed after tunnel deletion. ` +
        `This is a potential subdomain takeover risk. ` +
        `Please manually verify and remove the DNS record in Cloudflare dashboard.`
      )
      // Broadcast warning to user
      const warningTunnel: TunnelInfo = {
        type: 'named',
        status: 'stopped',
        publicUrl: `https://${domain}`,
        tunnelId: stored.tunnelId,
        warningMessage:
          `DNS CNAME 記錄 ${domain} 在 Tunnel 刪除後仍未移除，存在子網域接管風險。` +
          `請至 Cloudflare 儀表板手動確認並刪除該 DNS 記錄。`
      }
      broadcastTunnelStatus(siteId, warningTunnel)
    }
  }

  // Clean up all local state
  clearStuckTimer(siteId)
  activeNamedTunnels.delete(siteId)
  namedTunnelPorts.delete(siteId)
  reconnectWindows.delete(siteId)
  stderrBuffers.delete(siteId)
  siteStore.removeTunnel(siteId)
  siteStore.removeDomainBinding(siteId)
  broadcastTunnelStatus(siteId, null)
}

/**
 * Start (or restart) a Named Tunnel process.
 */
export async function startNamedTunnel(siteId: string, port: number): Promise<void> {
  requireAuth()

  const binaryPath = await findBinary()
  if (!binaryPath) throw new Error('cloudflared 尚未安裝')

  const stored = siteStore.getTunnels().find((t) => t.siteId === siteId)
  if (!stored) throw new Error('找不到此網頁的 Named Tunnel')

  const certPath = getCertForSite(siteId)

  const tunnelInfo: TunnelInfo = {
    type: 'named',
    status: 'starting',
    publicUrl: domainToUrl(siteId),
    tunnelId: stored.tunnelId
  }
  activeNamedTunnels.set(siteId, tunnelInfo)
  namedTunnelPorts.set(siteId, port)
  getWindow(siteId).reset()
  getStderrBuffer(siteId).clear()
  broadcastTunnelStatus(siteId, tunnelInfo)

  startTunnelProcess(siteId, stored.tunnelId, binaryPath, port, certPath)
}

/**
 * Stop a Named Tunnel (keeps config for restart).
 */
export function stopNamedTunnel(siteId: string): void {
  // Cancel any in-flight readiness probe
  readinessAbortControllers.get(siteId)?.abort()
  readinessAbortControllers.delete(siteId)

  // Stop the stuck-detection watchdog for this site.
  clearStuckTimer(siteId)

  const processId = `named-tunnel-${siteId}`
  const tunnel = activeNamedTunnels.get(siteId)

  if (tunnel) {
    tunnel.status = 'stopped'
    broadcastTunnelStatus(siteId, tunnel)
  }

  reconnectWindows.delete(siteId)
  stderrBuffers.delete(siteId)
  processManager.kill(processId)
}

/**
 * Get named tunnel info for a site.
 */
export function getNamedTunnelInfo(siteId: string): TunnelInfo | undefined {
  return activeNamedTunnels.get(siteId)
}

/**
 * Restore all named tunnels on app boot.
 */
export async function restoreNamedTunnels(
  getSitePort: (siteId: string) => number | null
): Promise<void> {
  const stored = siteStore.getTunnels()
  if (stored.length === 0) return

  const binaryPath = await findBinary()
  if (!binaryPath) {
    log.info('Cannot restore - cloudflared not found')
    return
  }

  for (const tunnel of stored) {
    const port = getSitePort(tunnel.siteId)
    if (!port) {
      log.info(`Skipping restore for ${tunnel.siteId} - site not running`)
      activeNamedTunnels.set(tunnel.siteId, {
        type: 'named',
        status: 'stopped',
        publicUrl: domainToUrl(tunnel.siteId),
        tunnelId: tunnel.tunnelId
      })
      continue
    }

    try {
      const certPath = getCertForSite(tunnel.siteId)
      const tunnelInfo: TunnelInfo = {
        type: 'named',
        status: 'starting',
        publicUrl: domainToUrl(tunnel.siteId),
        tunnelId: tunnel.tunnelId
      }
      activeNamedTunnels.set(tunnel.siteId, tunnelInfo)
      namedTunnelPorts.set(tunnel.siteId, port)
      startTunnelProcess(tunnel.siteId, tunnel.tunnelId, binaryPath, port, certPath)
      log.info(`Restored tunnel for site ${tunnel.siteId}`)
    } catch (err) {
      log.error(`Failed to restore tunnel for ${tunnel.siteId}:`, err)
      activeNamedTunnels.set(tunnel.siteId, {
        type: 'named',
        status: 'error',
        publicUrl: domainToUrl(tunnel.siteId),
        tunnelId: tunnel.tunnelId,
        errorMessage: '重啟 Tunnel 失敗'
      })
    }
  }
}

/** Stop all named tunnels (used on logout) */
export function stopAllNamedTunnels(): void {
  for (const [siteId] of activeNamedTunnels) {
    stopNamedTunnel(siteId)
  }
}

/** Start readiness probe for a tunnel URL, transitioning to running when ready */
function startReadinessProbe(siteId: string, url: string): void {
  const controller = new AbortController()
  readinessAbortControllers.set(siteId, controller)
  waitForTunnelReady(url, { signal: controller.signal })
    .then(() => {
      const current = activeNamedTunnels.get(siteId)
      if (current && current.status === 'verifying') {
        current.status = 'running'
        current.warningMessage = undefined
        getWindow(siteId).reset()
        startStuckWatchdog(siteId)
        broadcastTunnelStatus(siteId, current)
      }
    })
    .catch((err) => {
      log.info(`Readiness probe failed for ${siteId}: ${err instanceof Error ? err.message : String(err)}`)
      const current = activeNamedTunnels.get(siteId)
      if (current && current.status === 'verifying') {
        current.status = 'running'
        current.warningMessage = '本機 DNS 可能有快取問題，若無法開啟網址，請清除 DNS 快取後重試'
        getWindow(siteId).reset()
        startStuckWatchdog(siteId)
        broadcastTunnelStatus(siteId, current)
      }
    })
    .finally(() => {
      readinessAbortControllers.delete(siteId)
    })
}

function startTunnelProcess(
  siteId: string,
  tunnelId: string,
  binaryPath: string,
  port: number,
  certPath: string | null | undefined
): void {
  const processId = `named-tunnel-${siteId}`

  const onStderr = (id: string, data: string): void => {
    if (id !== processId) return

    if (data.includes('Registered tunnel connection') || data.includes('Connection')) {
      const tunnel = activeNamedTunnels.get(siteId)
      if (tunnel && (tunnel.status === 'starting' || tunnel.status === 'reconnecting')) {
        tunnel.status = 'verifying'
        tunnel.errorMessage = undefined
        broadcastTunnelStatus(siteId, tunnel)
        processManager.removeListener('stderr', onStderr)

        if (tunnel.publicUrl) {
          startReadinessProbe(siteId, tunnel.publicUrl)
        }
      }
    }
  }
  processManager.on('stderr', onStderr)

  // Fallback: auto-transition after 10 seconds if no log match
  setTimeout(() => {
    const tunnel = activeNamedTunnels.get(siteId)
    if (tunnel && (tunnel.status === 'starting' || tunnel.status === 'reconnecting')) {
      tunnel.status = 'verifying'
      tunnel.errorMessage = undefined
      broadcastTunnelStatus(siteId, tunnel)
      processManager.removeListener('stderr', onStderr)

      if (tunnel.publicUrl) {
        startReadinessProbe(siteId, tunnel.publicUrl)
      }
    }
  }, 10_000)

  const args = [
    ...(certPath ? ['--origincert', certPath] : []),
    'tunnel',
    'run',
    '--url',
    `http://localhost:${port}`,
    tunnelId
  ]

  processManager.spawn(processId, binaryPath, args)
}

function broadcastTunnelStatus(siteId: string, tunnel: TunnelInfo | null): void {
  const windows = BrowserWindow.getAllWindows()
  for (const win of windows) {
    win.webContents.send('tunnel-status-changed', siteId, tunnel)
  }
}
