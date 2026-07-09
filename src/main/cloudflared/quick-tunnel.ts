import { BrowserWindow } from 'electron'
import { ProcessManager } from './process-manager'
import { findBinary } from './detector'
import { createLogger } from '../logger'
import type { TunnelInfo } from '../../shared/types'
import { waitForTunnelReady } from './tunnel-readiness'
import { translateCloudflaredError } from './error-translator'
import { ReconnectWindow } from './reconnect-window'
import { StderrRingBuffer } from './stderr-ring-buffer'

const log = createLogger('QuickTunnel')

/** Active quick tunnels: siteId -> TunnelInfo */
const activeTunnels: Map<string, TunnelInfo> = new Map()

/** Track port per site for reconnect */
const sitePorts: Map<string, number> = new Map()

/** Sliding-window reconnect limiter per site (TIM-222) */
const reconnectWindows: Map<string, ReconnectWindow> = new Map()

/** Ring buffer of recent stderr lines per site, for diagnostics (TIM-222) */
const stderrBuffers: Map<string, StderrRingBuffer> = new Map()

/** Timestamp (ms) of the most recent translated stderr error per running site (TIM-222) */
const lastStderrErrorAt: Map<string, number> = new Map()

/** Stuck-detection timers per site (TIM-222) */
const stuckTimers: Map<string, ReturnType<typeof setInterval>> = new Map()

/** Track readiness probe abort controllers */
const readinessAbortControllers: Map<string, AbortController> = new Map()

/** Bounded retries for the initial start handshake (distinct from the runtime watchdog). */
const MAX_START_RETRIES = 3
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

/** Regex to match the quick tunnel URL from cloudflared stderr */
const TUNNEL_URL_REGEX = /https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/

let processManager: ProcessManager

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
export function getStderrSnapshot(siteId: string): string {
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
    const tunnel = activeTunnels.get(siteId)
    if (!tunnel || (tunnel.status !== 'running' && tunnel.status !== 'verifying')) return

    const lastErr = lastStderrErrorAt.get(siteId)
    if (lastErr === undefined) return

    if (Date.now() - lastErr >= STUCK_ERROR_THRESHOLD_MS) {
      log.warn(`Quick tunnel ${siteId} appears stuck (prolonged stderr errors, no exit) — recycling`)
      lastStderrErrorAt.delete(siteId)
      // Killing the process triggers the exit handler, which routes to reconnect.
      processManager.kill(`quick-tunnel-${siteId}`)
    }
  }, STUCK_CHECK_INTERVAL_MS)
  stuckTimers.set(siteId, timer)
}

export function initQuickTunnel(pm: ProcessManager): void {
  processManager = pm

  // Capture stderr into the ring buffer and track prolonged-error timing.
  pm.on('stderr', (id: string, data: string) => {
    if (!id.startsWith('quick-tunnel-')) return
    const siteId = id.replace('quick-tunnel-', '')
    getStderrBuffer(siteId).push(data)

    // Track timing of recognised errors so the stuck watchdog can fire.
    if (translateCloudflaredError(data).matched) {
      const tunnel = activeTunnels.get(siteId)
      if (tunnel && (tunnel.status === 'running' || tunnel.status === 'verifying')) {
        if (!lastStderrErrorAt.has(siteId)) lastStderrErrorAt.set(siteId, Date.now())
      }
    } else if (data.match(TUNNEL_URL_REGEX) || data.includes('Registered tunnel connection')) {
      // Healthy signal — clear any pending stuck timer state.
      lastStderrErrorAt.delete(siteId)
    }
  })

  // Listen for process exits to handle reconnect or update state
  pm.on('exit', (id: string, code: number | null) => {
    if (!id.startsWith('quick-tunnel-')) return
    const siteId = id.replace('quick-tunnel-', '')
    const tunnel = activeTunnels.get(siteId)
    if (!tunnel) return

    // Cancel any in-flight readiness probe
    readinessAbortControllers.get(siteId)?.abort()
    readinessAbortControllers.delete(siteId)
    lastStderrErrorAt.delete(siteId)

    // If explicitly stopped, don't reconnect
    if (tunnel.status === 'stopped') return

    // Still in initial start phase — let startQuickTunnel's handler deal with it
    if (tunnel.status === 'starting') return

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

/** Parse cloudflared stderr for known error patterns, returning a friendly message. */
function parseErrorMessage(stderrData: string): string | null {
  const translated = translateCloudflaredError(stderrData)
  return translated.matched ? translated.human : null
}

/** Attempt to reconnect a tunnel with exponential backoff (sliding-window limited) */
async function attemptReconnect(siteId: string): Promise<void> {
  const port = sitePorts.get(siteId)
  if (!port) return

  const win = getWindow(siteId)
  const now = Date.now()
  const delay = win.backoffDelay(now)
  win.recordAttempt(now)
  const attempts = win.attemptCount(now)

  const tunnel = activeTunnels.get(siteId)
  if (tunnel) {
    tunnel.status = 'reconnecting'
    tunnel.errorMessage = undefined
    broadcastTunnelStatus(siteId, tunnel)
  }

  log.info(`Reconnecting ${siteId} (attempt ${attempts}/${MAX_RECONNECT_ATTEMPTS} in window) in ${delay}ms`)

  await new Promise((resolve) => setTimeout(resolve, delay))

  // Check if tunnel was stopped during the delay
  const currentTunnel = activeTunnels.get(siteId)
  if (!currentTunnel || currentTunnel.status === 'stopped') return

  try {
    const binaryPath = await findBinary()
    if (!binaryPath) return

    const processId = `quick-tunnel-${siteId}`
    spawnTunnelProcess(siteId, processId, binaryPath, port)
  } catch (err) {
    log.error(`Reconnect failed for ${siteId}:`, err)
  }
}

/** Start readiness probe for a tunnel URL, transitioning to running when ready */
function startReadinessProbe(siteId: string, url: string): void {
  log.info(`Starting readiness probe for ${siteId}: ${url}`)
  const controller = new AbortController()
  readinessAbortControllers.set(siteId, controller)
  waitForTunnelReady(url, { signal: controller.signal })
    .then(() => {
      const current = activeTunnels.get(siteId)
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
      const current = activeTunnels.get(siteId)
      if (current && current.status === 'verifying') {
        current.status = 'running' // Fall through to running even if probe times out
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

/** Spawn the cloudflared tunnel process and listen for URL */
function spawnTunnelProcess(
  siteId: string,
  processId: string,
  binaryPath: string,
  port: number
): void {
  const onStderr = (id: string, data: string): void => {
    if (id !== processId) return

    const match = data.match(TUNNEL_URL_REGEX)
    if (match) {
      processManager.removeListener('stderr', onStderr)
      const tunnel = activeTunnels.get(siteId) || {
        type: 'quick' as const,
        status: 'verifying' as const,
        publicUrl: ''
      }
      tunnel.status = 'verifying'
      tunnel.publicUrl = match[0]
      tunnel.errorMessage = undefined
      activeTunnels.set(siteId, tunnel)
      broadcastTunnelStatus(siteId, tunnel)
      startReadinessProbe(siteId, match[0])
    }
  }

  processManager.on('stderr', onStderr)
  processManager.spawn(processId, binaryPath, ['tunnel', '--url', `http://localhost:${port}`])
}

/**
 * Start a Quick Tunnel for the given site.
 * Returns the public URL once detected.
 */
export async function startQuickTunnel(siteId: string, port: number): Promise<string> {
  // Edge case: already has a tunnel
  const existing = activeTunnels.get(siteId)
  if (existing && (existing.status === 'running' || existing.status === 'starting' || existing.status === 'verifying')) {
    if (existing.publicUrl) return existing.publicUrl
    throw new Error('此網站已有進行中的 Tunnel')
  }

  const binaryPath = await findBinary()
  if (!binaryPath) {
    throw new Error('cloudflared 尚未安裝，請先安裝 cloudflared')
  }

  const processId = `quick-tunnel-${siteId}`
  const tunnelInfo: TunnelInfo = {
    type: 'quick',
    status: 'starting',
    publicUrl: ''
  }
  activeTunnels.set(siteId, tunnelInfo)
  sitePorts.set(siteId, port)
  getWindow(siteId).reset()
  getStderrBuffer(siteId).clear()
  broadcastTunnelStatus(siteId, tunnelInfo)

  return new Promise<string>((resolve, reject) => {
    let attempts = 0
    let lastError: string | null = null

    const totalTimeout = setTimeout(() => {
      cleanup()
      stopQuickTunnel(siteId)
      reject(new Error('Quick Tunnel 啟動逾時（30 秒），請檢查網路連線'))
    }, 30_000)

    const cleanup = (): void => {
      clearTimeout(totalTimeout)
      processManager.removeListener('stderr', onStderr)
      processManager.removeListener('exit', onExit)
    }

    const onStderr = (id: string, data: string): void => {
      if (id !== processId) return
      log.info(`stderr: ${data.trimEnd()}`)

      // Check for URL match
      const match = data.match(TUNNEL_URL_REGEX)
      if (match) {
        cleanup()
        tunnelInfo.status = 'verifying'
        tunnelInfo.publicUrl = match[0]
        tunnelInfo.errorMessage = undefined
        activeTunnels.set(siteId, tunnelInfo)
        broadcastTunnelStatus(siteId, tunnelInfo)
        startReadinessProbe(siteId, match[0])
        resolve(match[0])
        return
      }

      // Check for error patterns
      const errorMsg = parseErrorMessage(data)
      if (errorMsg) {
        lastError = errorMsg
      }
    }

    const onExit = (id: string, code: number | null): void => {
      if (id !== processId) return

      // Transient failure during the initial start handshake — retry with backoff
      if (code !== 0 && code !== null && attempts < MAX_START_RETRIES) {
        attempts++
        const delay = BACKOFF_BASE_MS * Math.pow(2, attempts - 1)
        log.info(`Start failed, retrying ${siteId} (attempt ${attempts}/${MAX_START_RETRIES}) in ${delay}ms`)
        tunnelInfo.status = 'starting'
        tunnelInfo.errorMessage = undefined
        broadcastTunnelStatus(siteId, tunnelInfo)

        setTimeout(() => {
          // Check if tunnel was stopped during the delay
          const current = activeTunnels.get(siteId)
          if (!current || current.status === 'stopped') {
            cleanup()
            return
          }
          try {
            lastError = null
            processManager.spawn(processId, binaryPath, [
              'tunnel',
              '--url',
              `http://localhost:${port}`
            ])
          } catch (err) {
            cleanup()
            activeTunnels.delete(siteId)
            sitePorts.delete(siteId)
            broadcastTunnelStatus(siteId, null)
            reject(new Error(`啟動 cloudflared 失敗：${err instanceof Error ? err.message : String(err)}`))
          }
        }, delay)
        return
      }

      // All retries exhausted or clean exit
      cleanup()

      const errorMessage =
        lastError ||
        (code !== null
          ? `cloudflared 啟動失敗（錯誤碼 ${code}），Cloudflare 服務可能暫時不可用，請稍後重試`
          : '無法連線至 Cloudflare，請檢查網路連線')

      tunnelInfo.status = 'error'
      tunnelInfo.errorMessage = errorMessage
      activeTunnels.set(siteId, tunnelInfo)
      broadcastTunnelStatus(siteId, tunnelInfo)
      reject(new Error(errorMessage))
    }

    processManager.on('stderr', onStderr)
    processManager.on('exit', onExit)

    try {
      processManager.spawn(processId, binaryPath, [
        'tunnel',
        '--url',
        `http://localhost:${port}`
      ])
    } catch (err) {
      cleanup()
      activeTunnels.delete(siteId)
      sitePorts.delete(siteId)
      broadcastTunnelStatus(siteId, null)
      reject(new Error(`啟動 cloudflared 失敗：${err instanceof Error ? err.message : String(err)}`))
    }
  })
}

/**
 * Stop a Quick Tunnel for the given site.
 */
export function stopQuickTunnel(siteId: string): void {
  // Cancel any in-flight readiness probe
  readinessAbortControllers.get(siteId)?.abort()
  readinessAbortControllers.delete(siteId)

  // Stop the stuck-detection watchdog for this site.
  clearStuckTimer(siteId)

  const processId = `quick-tunnel-${siteId}`
  const tunnel = activeTunnels.get(siteId)

  if (tunnel) {
    tunnel.status = 'stopped'
  }

  processManager.kill(processId)
  activeTunnels.delete(siteId)
  sitePorts.delete(siteId)
  reconnectWindows.delete(siteId)
  stderrBuffers.delete(siteId)
  broadcastTunnelStatus(siteId, null)
}

/**
 * Stop all quick tunnels (used on app quit).
 */
export function stopAllQuickTunnels(): void {
  const siteIds = Array.from(activeTunnels.keys())
  for (const siteId of siteIds) {
    stopQuickTunnel(siteId)
  }
}

/**
 * Get the current tunnel info for a site.
 */
export function getTunnelInfo(siteId: string): TunnelInfo | undefined {
  return activeTunnels.get(siteId)
}

/**
 * Check if a site has an active tunnel.
 */
export function hasTunnel(siteId: string): boolean {
  const tunnel = activeTunnels.get(siteId)
  return !!tunnel && tunnel.status !== 'stopped' && tunnel.status !== 'error'
}

function broadcastTunnelStatus(siteId: string, tunnel: TunnelInfo | null): void {
  const windows = BrowserWindow.getAllWindows()
  for (const win of windows) {
    win.webContents.send('tunnel-status-changed', siteId, tunnel)
  }
}
