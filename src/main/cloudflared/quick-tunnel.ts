import { BrowserWindow } from 'electron'
import { ProcessManager } from './process-manager'
import { findBinary } from './detector'
import type { TunnelInfo } from '../../shared/types'

/** Active quick tunnels: siteId -> TunnelInfo */
const activeTunnels: Map<string, TunnelInfo> = new Map()

/** Track port per site for reconnect */
const sitePorts: Map<string, number> = new Map()

/** Track reconnect attempts per site */
const reconnectAttempts: Map<string, number> = new Map()

const MAX_RECONNECT_ATTEMPTS = 3
const BACKOFF_BASE_MS = 2000

/** Regex to match the quick tunnel URL from cloudflared stderr */
const TUNNEL_URL_REGEX = /https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/

/** Map cloudflared error patterns to user-friendly Chinese messages */
const ERROR_PATTERNS: Array<{ pattern: RegExp; message: string }> = [
  { pattern: /connection refused/i, message: '無法連線至 Cloudflare，請檢查網路連線' },
  { pattern: /no such host/i, message: '無法連線至 Cloudflare，請檢查網路連線' },
  { pattern: /timeout/i, message: '連線逾時，請檢查網路連線' },
  { pattern: /failed to connect to edge/i, message: 'Cloudflare 服務暫時不可用，請稍後重試' },
  { pattern: /connection reset/i, message: '連線中斷，請檢查網路連線' },
  { pattern: /i\/o timeout/i, message: '連線逾時，請檢查網路連線' }
]

let processManager: ProcessManager

export function initQuickTunnel(pm: ProcessManager): void {
  processManager = pm

  // Listen for process exits to handle reconnect or update state
  pm.on('exit', (id: string, code: number | null) => {
    if (!id.startsWith('quick-tunnel-')) return
    const siteId = id.replace('quick-tunnel-', '')
    const tunnel = activeTunnels.get(siteId)
    if (!tunnel) return

    // If explicitly stopped, don't reconnect
    if (tunnel.status === 'stopped') return

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

/** Parse cloudflared stderr for known error patterns */
function parseErrorMessage(stderrData: string): string | null {
  for (const { pattern, message } of ERROR_PATTERNS) {
    if (pattern.test(stderrData)) {
      return message
    }
  }
  return null
}

/** Attempt to reconnect a tunnel with exponential backoff */
async function attemptReconnect(siteId: string): Promise<void> {
  const port = sitePorts.get(siteId)
  if (!port) return

  const attempts = (reconnectAttempts.get(siteId) || 0) + 1
  reconnectAttempts.set(siteId, attempts)

  const tunnel = activeTunnels.get(siteId)
  if (tunnel) {
    tunnel.status = 'reconnecting'
    tunnel.errorMessage = undefined
    broadcastTunnelStatus(siteId, tunnel)
  }

  const delay = BACKOFF_BASE_MS * Math.pow(2, attempts - 1)
  console.log(`[QuickTunnel] Reconnecting ${siteId} (attempt ${attempts}/${MAX_RECONNECT_ATTEMPTS}) in ${delay}ms`)

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
    console.error(`[QuickTunnel] Reconnect failed for ${siteId}:`, err)
  }
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
        status: 'running' as const,
        publicUrl: ''
      }
      tunnel.status = 'running'
      tunnel.publicUrl = match[0]
      tunnel.errorMessage = undefined
      activeTunnels.set(siteId, tunnel)
      reconnectAttempts.delete(siteId)
      broadcastTunnelStatus(siteId, tunnel)
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
  if (existing && (existing.status === 'running' || existing.status === 'starting')) {
    if (existing.publicUrl) return existing.publicUrl
    throw new Error('此網頁已有進行中的 Tunnel')
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
  reconnectAttempts.delete(siteId)
  broadcastTunnelStatus(siteId, tunnelInfo)

  return new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup()
      stopQuickTunnel(siteId)
      reject(new Error('Quick Tunnel 啟動逾時（15 秒），請檢查網路連線'))
    }, 15_000)

    const cleanup = (): void => {
      clearTimeout(timeout)
      processManager.removeListener('stderr', onStderr)
      processManager.removeListener('exit', onExit)
    }

    let lastError: string | null = null

    const onStderr = (id: string, data: string): void => {
      if (id !== processId) return

      // Check for URL match
      const match = data.match(TUNNEL_URL_REGEX)
      if (match) {
        cleanup()
        tunnelInfo.status = 'running'
        tunnelInfo.publicUrl = match[0]
        tunnelInfo.errorMessage = undefined
        activeTunnels.set(siteId, tunnelInfo)
        broadcastTunnelStatus(siteId, tunnelInfo)
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
      cleanup()

      const errorMessage =
        lastError ||
        (code !== null
          ? `cloudflared 啟動失敗（錯誤碼 ${code}），請檢查網路連線`
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
  const processId = `quick-tunnel-${siteId}`
  const tunnel = activeTunnels.get(siteId)

  if (tunnel) {
    tunnel.status = 'stopped'
  }

  processManager.kill(processId)
  activeTunnels.delete(siteId)
  sitePorts.delete(siteId)
  reconnectAttempts.delete(siteId)
  broadcastTunnelStatus(siteId, null)
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
