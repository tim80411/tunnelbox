import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { BrowserWindow } from 'electron'
import type {
  TunnelProvider,
  ProviderEnv,
  ProviderAuthInfo,
  ProviderTunnelInfo,
  TunnelOptions
} from '../../../shared/provider-types'
import type { TunnelStatus } from '../../../shared/types'
import type { ProcessManager } from '../../cloudflared/process-manager'
import { detectFrpc } from './detector'
import { installFrpc } from './installer'
import { getFrpConfig } from './frp-config-store'
import { findBinary } from './detector'
import { createLogger } from '../../logger'

const log = createLogger('FrpProvider')

const URL_DISCOVERY_TIMEOUT_MS = 15_000
const PROCESS_ID_PREFIX = 'frp-'

interface FrpTunnelState {
  siteId: string
  status: TunnelStatus
  publicUrl?: string
  errorMessage?: string
}

export class FrpProvider implements TunnelProvider {
  readonly type = 'frp'
  private tunnels: Map<string, FrpTunnelState> = new Map()
  private processManager: ProcessManager

  constructor(processManager: ProcessManager) {
    this.processManager = processManager
  }

  async detect(): Promise<ProviderEnv> {
    return detectFrpc()
  }

  async install(): Promise<void> {
    await installFrpc()
  }

  async login(): Promise<ProviderAuthInfo> {
    // frp doesn't use OAuth — config is handled via separate IPC
    return { status: 'not_required' }
  }

  async logout(): Promise<void> {
    // No-op for frp
  }

  getAuthStatus(): ProviderAuthInfo {
    const config = getFrpConfig()
    if (config) {
      return { status: 'not_required' }
    }
    return { status: 'not_required' }
  }

  async startTunnel(siteId: string, port: number, opts?: TunnelOptions): Promise<string> {
    const config = getFrpConfig()
    if (!config) {
      throw new Error('請先設定 frp 伺服器')
    }

    const binaryPath = await findBinary()
    if (!binaryPath) {
      throw new Error('找不到 frpc，請先安裝')
    }

    // Generate temp frpc.toml config
    const remotePort = opts?.remotePort as number | undefined
    const proxyName = `tunnelbox-${siteId}`
    const tomlContent = this.generateToml(config.serverAddr, config.serverPort, config.authToken, proxyName, port, remotePort)

    const tmpDir = path.join(os.tmpdir(), 'tunnelbox-frp')
    fs.mkdirSync(tmpDir, { recursive: true })
    const configPath = path.join(tmpDir, `frpc-${siteId}.toml`)
    fs.writeFileSync(configPath, tomlContent, 'utf-8')

    // Set starting state
    const state: FrpTunnelState = {
      siteId,
      status: 'starting',
    }
    this.tunnels.set(siteId, state)
    this.broadcastStatus(siteId)

    const processId = `${PROCESS_ID_PREFIX}${siteId}`

    // Spawn frpc
    this.processManager.spawn(processId, binaryPath, ['-c', configPath])

    // Listen for URL discovery from stdout/stderr
    const urlPromise = new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup()
        const tunnel = this.tunnels.get(siteId)
        if (tunnel && tunnel.status === 'starting') {
          tunnel.status = 'error'
          tunnel.errorMessage = '無法確定公開 URL'
          this.broadcastStatus(siteId)
        }
        reject(new Error('無法確定公開 URL'))
      }, URL_DISCOVERY_TIMEOUT_MS)

      const onStdout = (id: string, data: string): void => {
        if (id !== processId) return
        log.debug(`frpc stdout [${siteId}]: ${data}`)
        const url = this.parseUrlFromOutput(data, config.serverAddr, remotePort)
        if (url) {
          cleanup()
          resolve(url)
        }
      }

      const onStderr = (id: string, data: string): void => {
        if (id !== processId) return
        log.debug(`frpc stderr [${siteId}]: ${data}`)
        const url = this.parseUrlFromOutput(data, config.serverAddr, remotePort)
        if (url) {
          cleanup()
          resolve(url)
        }
        // Check for login/auth errors
        if (data.includes('login to server failed') || data.includes('authorization failed')) {
          cleanup()
          const tunnel = this.tunnels.get(siteId)
          if (tunnel) {
            tunnel.status = 'error'
            tunnel.errorMessage = 'frp 伺服器認證失敗，請檢查設定'
            this.broadcastStatus(siteId)
          }
          reject(new Error('frp 伺服器認證失敗'))
        }
      }

      const onExit = (id: string, code: number | null): void => {
        if (id !== processId) return
        cleanup()
        const tunnel = this.tunnels.get(siteId)
        if (tunnel && tunnel.status !== 'running') {
          tunnel.status = 'error'
          tunnel.errorMessage = `frpc 程式異常退出（代碼 ${code}）`
          this.broadcastStatus(siteId)
          reject(new Error(`frpc exited with code ${code}`))
        }
      }

      const cleanup = (): void => {
        clearTimeout(timeout)
        this.processManager.removeListener('stdout', onStdout)
        this.processManager.removeListener('stderr', onStderr)
        this.processManager.removeListener('exit', onExit)
      }

      this.processManager.on('stdout', onStdout)
      this.processManager.on('stderr', onStderr)
      this.processManager.on('exit', onExit)
    })

    try {
      const publicUrl = await urlPromise
      const tunnel = this.tunnels.get(siteId)
      if (tunnel) {
        tunnel.status = 'running'
        tunnel.publicUrl = publicUrl
        this.broadcastStatus(siteId)
      }

      // Listen for process exit after running
      this.processManager.on('exit', (id: string) => {
        if (id !== processId) return
        const t = this.tunnels.get(siteId)
        if (t && t.status === 'running') {
          t.status = 'stopped'
          t.publicUrl = undefined
          this.broadcastStatus(siteId)
        }
      })

      return publicUrl
    } catch (err) {
      // Cleanup config file on failure
      try { fs.unlinkSync(configPath) } catch { /* ignore */ }
      throw err
    }
  }

  async stopTunnel(siteId: string): Promise<void> {
    const processId = `${PROCESS_ID_PREFIX}${siteId}`
    this.processManager.kill(processId)
    const tunnel = this.tunnels.get(siteId)
    if (tunnel) {
      tunnel.status = 'stopped'
      tunnel.publicUrl = undefined
      this.broadcastStatus(siteId)
    }
    this.tunnels.delete(siteId)

    // Cleanup temp config
    const configPath = path.join(os.tmpdir(), 'tunnelbox-frp', `frpc-${siteId}.toml`)
    try { fs.unlinkSync(configPath) } catch { /* ignore */ }
  }

  getTunnelInfo(siteId: string): ProviderTunnelInfo | undefined {
    const tunnel = this.tunnels.get(siteId)
    if (!tunnel) return undefined
    return {
      providerType: 'frp',
      status: tunnel.status,
      publicUrl: tunnel.publicUrl,
      errorMessage: tunnel.errorMessage,
    }
  }

  async restoreAll(_getSitePort: (siteId: string) => number | null): Promise<void> {
    // frp tunnels are not persistent — they require a running frpc process
    // No restore needed on app boot
  }

  async stopAll(): Promise<void> {
    const siteIds = Array.from(this.tunnels.keys())
    for (const siteId of siteIds) {
      await this.stopTunnel(siteId)
    }
  }

  // -- Private helpers --

  private generateToml(
    serverAddr: string,
    serverPort: number,
    authToken: string | undefined,
    proxyName: string,
    localPort: number,
    remotePort?: number
  ): string {
    const lines: string[] = [
      `serverAddr = "${serverAddr}"`,
      `serverPort = ${serverPort}`,
    ]

    if (authToken) {
      lines.push('')
      lines.push('[auth]')
      lines.push(`method = "token"`)
      lines.push(`token = "${authToken}"`)
    }

    lines.push('')
    lines.push(`[[proxies]]`)
    lines.push(`name = "${proxyName}"`)
    lines.push(`type = "tcp"`)
    lines.push(`localIP = "127.0.0.1"`)
    lines.push(`localPort = ${localPort}`)
    if (remotePort) {
      lines.push(`remotePort = ${remotePort}`)
    }

    return lines.join('\n') + '\n'
  }

  /** Parse frpc output for proxy success and extract the URL */
  private parseUrlFromOutput(data: string, serverAddr: string, remotePort?: number): string | null {
    // frpc logs: "start proxy success" when connected
    if (data.includes('start proxy success')) {
      // Try to extract remote port from output
      // frpc output: "proxy [tunnelbox-xxx] tcp proxy started, remote addr :12345"
      const portMatch = data.match(/remote addr\s*(?:\[.*?\])?\s*:(\d+)/)
      if (portMatch) {
        return `http://${serverAddr}:${portMatch[1]}`
      }
      // If we have a configured remote port, use that
      if (remotePort) {
        return `http://${serverAddr}:${remotePort}`
      }
    }

    // Also check for the "tcp proxy" log line which sometimes has the port
    const tcpMatch = data.match(/tcp.*?remote.*?:(\d+)/)
    if (tcpMatch) {
      return `http://${serverAddr}:${tcpMatch[1]}`
    }

    return null
  }

  private broadcastStatus(siteId: string): void {
    const info = this.getTunnelInfo(siteId)
    const windows = BrowserWindow.getAllWindows()
    for (const win of windows) {
      win.webContents.send('tunnel-status-changed', siteId, info || null)
    }
  }
}
