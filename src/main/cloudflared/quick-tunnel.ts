import { BrowserWindow } from 'electron'
import { ProcessManager } from './process-manager'
import { findBinary } from './detector'
import type { TunnelInfo } from '../../shared/types'

/** Active quick tunnels: siteId -> TunnelInfo */
const activeTunnels: Map<string, TunnelInfo> = new Map()

/** Regex to match the quick tunnel URL from cloudflared stderr */
const TUNNEL_URL_REGEX = /https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/

let processManager: ProcessManager

export function initQuickTunnel(pm: ProcessManager): void {
  processManager = pm

  // Listen for process exits to update tunnel state
  pm.on('exit', (id: string, code: number | null) => {
    if (!id.startsWith('quick-tunnel-')) return
    const siteId = id.replace('quick-tunnel-', '')
    const tunnel = activeTunnels.get(siteId)
    if (!tunnel) return

    // Only mark as error/stopped if it wasn't already explicitly stopped
    if (tunnel.status !== 'stopped') {
      if (code !== 0 && code !== null) {
        tunnel.status = 'error'
        tunnel.errorMessage = 'Tunnel 程序意外退出'
      } else {
        tunnel.status = 'stopped'
      }
      broadcastTunnelStatus(siteId, tunnel)
    }
  })
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
    }

    const onStderr = (id: string, data: string): void => {
      if (id !== processId) return

      const match = data.match(TUNNEL_URL_REGEX)
      if (match) {
        cleanup()
        tunnelInfo.status = 'running'
        tunnelInfo.publicUrl = match[0]
        activeTunnels.set(siteId, tunnelInfo)
        broadcastTunnelStatus(siteId, tunnelInfo)
        resolve(match[0])
      }
    }

    processManager.on('stderr', onStderr)

    // Also handle early process exit
    const onExit = (id: string, code: number | null): void => {
      if (id !== processId) return
      cleanup()
      processManager.removeListener('exit', onExit)
      reject(
        new Error(
          code !== null
            ? `cloudflared 啟動失敗（錯誤碼 ${code}），請檢查網路連線`
            : '無法連線至 Cloudflare，請檢查網路連線'
        )
      )
    }
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
  return !!tunnel && (tunnel.status === 'running' || tunnel.status === 'starting')
}

function broadcastTunnelStatus(siteId: string, tunnel: TunnelInfo | null): void {
  const windows = BrowserWindow.getAllWindows()
  for (const win of windows) {
    win.webContents.send('tunnel-status-changed', siteId, tunnel)
  }
}
