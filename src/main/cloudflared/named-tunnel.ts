import { BrowserWindow } from 'electron'
import { execFile } from 'node:child_process'
import { ProcessManager } from './process-manager'
import { findBinary } from './detector'
import { getAuthStatus } from './auth-manager'
import { stopQuickTunnel, hasTunnel as hasQuickTunnel } from './quick-tunnel'
import * as siteStore from '../store'
import type { TunnelInfo, StoredTunnel } from '../../shared/types'

/** Active named tunnels in memory: siteId -> TunnelInfo */
const activeNamedTunnels: Map<string, TunnelInfo> = new Map()

/** Track port per site for reconnect */
const namedTunnelPorts: Map<string, number> = new Map()

/** Track reconnect attempts */
const reconnectAttempts: Map<string, number> = new Map()

const MAX_RECONNECT_ATTEMPTS = 3
const BACKOFF_BASE_MS = 2000

/** Error patterns for named tunnel operations */
const NAMED_TUNNEL_ERRORS: Array<{ pattern: RegExp; message: string }> = [
  { pattern: /certificate.*expired/i, message: '認證已過期，請重新登入' },
  { pattern: /auth.*expired/i, message: '認證已過期，請重新登入' },
  { pattern: /unauthorized/i, message: '認證已過期，請重新登入' },
  { pattern: /tunnel limit/i, message: '已達 Tunnel 數量上限' },
  { pattern: /quota/i, message: '已達 Tunnel 數量上限' },
  { pattern: /connection refused/i, message: '無法連線至 Cloudflare，請檢查網路連線' },
  { pattern: /no such host/i, message: '無法連線至 Cloudflare，請檢查網路連線' },
  { pattern: /failed to connect to edge/i, message: 'Cloudflare 服務暫時不可用，請稍後重試' },
  { pattern: /timeout/i, message: '連線逾時，請檢查網路連線' }
]

let processManager: ProcessManager
let lastStderrError: Map<string, string> = new Map()

export function initNamedTunnel(pm: ProcessManager): void {
  processManager = pm

  // Capture stderr errors for diagnostics
  pm.on('stderr', (id: string, data: string) => {
    if (!id.startsWith('named-tunnel-')) return
    const errorMsg = parseNamedTunnelError(data)
    if (errorMsg) {
      lastStderrError.set(id, errorMsg)
    }
  })

  pm.on('exit', (id: string, code: number | null) => {
    if (!id.startsWith('named-tunnel-')) return
    const siteId = id.replace('named-tunnel-', '')
    const tunnel = activeNamedTunnels.get(siteId)
    if (!tunnel) return

    // If explicitly stopped, don't reconnect
    if (tunnel.status === 'stopped') return

    // Check for auth-related errors (no reconnect, prompt re-login)
    const stderrMsg = lastStderrError.get(id)
    lastStderrError.delete(id)

    if (stderrMsg && (stderrMsg.includes('認證已過期') || stderrMsg.includes('數量上限'))) {
      tunnel.status = 'error'
      tunnel.errorMessage = stderrMsg
      reconnectAttempts.delete(siteId)
      broadcastTunnelStatus(siteId, tunnel)

      // Broadcast auth expired if applicable
      if (stderrMsg.includes('認證已過期')) {
        broadcastAuthExpired()
      }
      return
    }

    // Unexpected exit with non-zero code -> attempt reconnect
    if (code !== 0 && code !== null) {
      const attempts = reconnectAttempts.get(siteId) || 0
      if (attempts < MAX_RECONNECT_ATTEMPTS) {
        attemptReconnect(siteId)
      } else {
        tunnel.status = 'error'
        tunnel.errorMessage = 'Tunnel 已斷線，請手動重新啟動'
        reconnectAttempts.delete(siteId)
        broadcastTunnelStatus(siteId, tunnel)
      }
    } else {
      tunnel.status = 'stopped'
      broadcastTunnelStatus(siteId, tunnel)
    }
  })
}

function parseNamedTunnelError(data: string): string | null {
  for (const { pattern, message } of NAMED_TUNNEL_ERRORS) {
    if (pattern.test(data)) return message
  }
  return null
}

async function attemptReconnect(siteId: string): Promise<void> {
  const port = namedTunnelPorts.get(siteId)
  const stored = siteStore.getTunnels().find((t) => t.siteId === siteId)
  if (!port || !stored) return

  const attempts = (reconnectAttempts.get(siteId) || 0) + 1
  reconnectAttempts.set(siteId, attempts)

  const tunnel = activeNamedTunnels.get(siteId)
  if (tunnel) {
    tunnel.status = 'reconnecting'
    tunnel.errorMessage = undefined
    broadcastTunnelStatus(siteId, tunnel)
  }

  const delay = BACKOFF_BASE_MS * Math.pow(2, attempts - 1)
  console.log(
    `[NamedTunnel] Reconnecting ${siteId} (attempt ${attempts}/${MAX_RECONNECT_ATTEMPTS}) in ${delay}ms`
  )

  await new Promise((resolve) => setTimeout(resolve, delay))

  // Check if tunnel was stopped during the delay
  const currentTunnel = activeNamedTunnels.get(siteId)
  if (!currentTunnel || currentTunnel.status === 'stopped') return

  try {
    const binaryPath = await findBinary()
    if (!binaryPath) return
    startTunnelProcess(siteId, stored.tunnelId, binaryPath, port)
  } catch (err) {
    console.error(`[NamedTunnel] Reconnect failed for ${siteId}:`, err)
  }
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

function runCloudflared(binaryPath: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(binaryPath, args, { timeout: 30_000 }, (err, stdout, stderr) => {
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
 * Create a Named Tunnel for a site.
 * Returns the public URL (tunnelId.cfargotunnel.com).
 */
export async function createNamedTunnel(
  siteId: string,
  port: number
): Promise<string> {
  requireAuth()

  const binaryPath = await findBinary()
  if (!binaryPath) throw new Error('cloudflared 尚未安裝')

  // Stop any existing quick tunnel
  if (hasQuickTunnel(siteId)) {
    stopQuickTunnel(siteId)
  }

  const tunnelName = `site-holder-${siteId.slice(0, 8)}`

  // Create tunnel
  const createOutput = await runCloudflared(binaryPath, ['tunnel', 'create', tunnelName])
  console.log(`[NamedTunnel] Create output: ${createOutput}`)

  // Parse tunnel ID from output (format: "Created tunnel <name> with id <uuid>")
  const idMatch =
    createOutput.match(/with id ([a-f0-9-]{36})/i) ||
    createOutput.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i)
  if (!idMatch) {
    throw new Error('無法解析 Tunnel ID')
  }
  const tunnelId = idMatch[1]
  const publicUrl = `https://${tunnelId}.cfargotunnel.com`

  // Persist tunnel info
  const stored: StoredTunnel = { siteId, tunnelId, tunnelName, publicUrl }
  siteStore.saveTunnel(stored)

  // Start the tunnel
  const tunnelInfo: TunnelInfo = {
    type: 'named',
    status: 'starting',
    publicUrl,
    tunnelId
  }
  activeNamedTunnels.set(siteId, tunnelInfo)
  namedTunnelPorts.set(siteId, port)
  reconnectAttempts.delete(siteId)
  broadcastTunnelStatus(siteId, tunnelInfo)

  startTunnelProcess(siteId, tunnelId, binaryPath, port)

  return publicUrl
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

  const tunnelInfo: TunnelInfo = {
    type: 'named',
    status: 'starting',
    publicUrl: stored.publicUrl,
    tunnelId: stored.tunnelId
  }
  activeNamedTunnels.set(siteId, tunnelInfo)
  namedTunnelPorts.set(siteId, port)
  reconnectAttempts.delete(siteId)
  broadcastTunnelStatus(siteId, tunnelInfo)

  startTunnelProcess(siteId, stored.tunnelId, binaryPath, port)
}

/**
 * Stop a Named Tunnel (keeps config for restart).
 */
export function stopNamedTunnel(siteId: string): void {
  const processId = `named-tunnel-${siteId}`
  const tunnel = activeNamedTunnels.get(siteId)

  if (tunnel) {
    tunnel.status = 'stopped'
    broadcastTunnelStatus(siteId, tunnel)
  }

  reconnectAttempts.delete(siteId)
  processManager.kill(processId)
}

/**
 * Delete a Named Tunnel entirely from Cloudflare + local store.
 */
export async function deleteNamedTunnel(siteId: string): Promise<void> {
  requireAuth()

  const stored = siteStore.getTunnels().find((t) => t.siteId === siteId)
  if (!stored) throw new Error('找不到此網頁的 Named Tunnel')

  // Stop if running
  const processId = `named-tunnel-${siteId}`
  if (processManager.isRunning(processId)) {
    processManager.kill(processId)
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }

  // Delete from Cloudflare
  const binaryPath = await findBinary()
  if (!binaryPath) throw new Error('cloudflared 尚未安裝')

  try {
    await runCloudflared(binaryPath, ['tunnel', 'delete', stored.tunnelId])
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (!msg.includes('not found') && !msg.includes('does not exist')) {
      throw new Error(`刪除 Tunnel 失敗：${msg}`)
    }
  }

  // Clean up local state
  activeNamedTunnels.delete(siteId)
  namedTunnelPorts.delete(siteId)
  reconnectAttempts.delete(siteId)
  siteStore.removeTunnel(siteId)
  broadcastTunnelStatus(siteId, null)
}

/**
 * Get named tunnel info for a site.
 */
export function getNamedTunnelInfo(siteId: string): TunnelInfo | undefined {
  return activeNamedTunnels.get(siteId)
}

/**
 * Check if site has a stored named tunnel (even if not running).
 */
export function hasStoredNamedTunnel(siteId: string): boolean {
  return siteStore.getTunnels().some((t) => t.siteId === siteId)
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
    console.log('[NamedTunnel] Cannot restore - cloudflared not found')
    return
  }

  for (const tunnel of stored) {
    const port = getSitePort(tunnel.siteId)
    if (!port) {
      console.log(`[NamedTunnel] Skipping restore for ${tunnel.siteId} - site not running`)
      activeNamedTunnels.set(tunnel.siteId, {
        type: 'named',
        status: 'stopped',
        publicUrl: tunnel.publicUrl,
        tunnelId: tunnel.tunnelId
      })
      continue
    }

    try {
      const tunnelInfo: TunnelInfo = {
        type: 'named',
        status: 'starting',
        publicUrl: tunnel.publicUrl,
        tunnelId: tunnel.tunnelId
      }
      activeNamedTunnels.set(tunnel.siteId, tunnelInfo)
      namedTunnelPorts.set(tunnel.siteId, port)
      startTunnelProcess(tunnel.siteId, tunnel.tunnelId, binaryPath, port)
      console.log(`[NamedTunnel] Restored tunnel for site ${tunnel.siteId}`)
    } catch (err) {
      console.error(`[NamedTunnel] Failed to restore tunnel for ${tunnel.siteId}:`, err)
      activeNamedTunnels.set(tunnel.siteId, {
        type: 'named',
        status: 'error',
        publicUrl: tunnel.publicUrl,
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

function startTunnelProcess(
  siteId: string,
  tunnelId: string,
  binaryPath: string,
  port: number
): void {
  const processId = `named-tunnel-${siteId}`

  const onStderr = (id: string, data: string): void => {
    if (id !== processId) return

    if (data.includes('Registered tunnel connection') || data.includes('Connection')) {
      const tunnel = activeNamedTunnels.get(siteId)
      if (tunnel && tunnel.status === 'starting') {
        tunnel.status = 'running'
        tunnel.errorMessage = undefined
        reconnectAttempts.delete(siteId)
        broadcastTunnelStatus(siteId, tunnel)
        processManager.removeListener('stderr', onStderr)
      }
    }
  }
  processManager.on('stderr', onStderr)

  // Auto-mark as running after 10 seconds if no log match
  setTimeout(() => {
    const tunnel = activeNamedTunnels.get(siteId)
    if (tunnel && tunnel.status === 'starting') {
      tunnel.status = 'running'
      tunnel.errorMessage = undefined
      reconnectAttempts.delete(siteId)
      broadcastTunnelStatus(siteId, tunnel)
      processManager.removeListener('stderr', onStderr)
    }
  }, 10_000)

  processManager.spawn(processId, binaryPath, [
    'tunnel',
    'run',
    '--url',
    `http://localhost:${port}`,
    tunnelId
  ])
}

function broadcastTunnelStatus(siteId: string, tunnel: TunnelInfo | null): void {
  const windows = BrowserWindow.getAllWindows()
  for (const win of windows) {
    win.webContents.send('tunnel-status-changed', siteId, tunnel)
  }
}
