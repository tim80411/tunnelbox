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

let processManager: ProcessManager

export function initNamedTunnel(pm: ProcessManager): void {
  processManager = pm

  pm.on('exit', (id: string, code: number | null) => {
    if (!id.startsWith('named-tunnel-')) return
    const siteId = id.replace('named-tunnel-', '')
    const tunnel = activeNamedTunnels.get(siteId)
    if (!tunnel) return

    if (tunnel.status !== 'stopped') {
      if (code !== 0 && code !== null) {
        tunnel.status = 'error'
        tunnel.errorMessage = 'Named Tunnel 程序意外退出'
      } else {
        tunnel.status = 'stopped'
      }
      broadcastTunnelStatus(siteId, tunnel)
    }
  })
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
        reject(new Error(output))
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
  const idMatch = createOutput.match(
    /with id ([a-f0-9-]{36})/i
  ) || createOutput.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i)
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
    // Wait briefly for process to exit
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
    // If not found, it was already deleted externally - continue cleanup
  }

  // Clean up local state
  activeNamedTunnels.delete(siteId)
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
      // Still register as stopped so UI shows it
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

  // Listen for the tunnel to become ready (cloudflared logs "Connection ... registered")
  const onStderr = (id: string, data: string): void => {
    if (id !== processId) return

    if (data.includes('Registered tunnel connection') || data.includes('Connection')) {
      const tunnel = activeNamedTunnels.get(siteId)
      if (tunnel && tunnel.status === 'starting') {
        tunnel.status = 'running'
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
