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
import { detectBore } from './detector'
import { installBore } from './installer'
import { getBoreConfig } from './bore-config-store'
import { findBinary } from './detector'
import { createLogger } from '../../logger'

const log = createLogger('BoreProvider')

const URL_DISCOVERY_TIMEOUT_MS = 15_000
const PROCESS_ID_PREFIX = 'bore-'

interface BoreTunnelState {
  siteId: string
  status: TunnelStatus
  publicUrl?: string
  errorMessage?: string
}

export class BoreProvider implements TunnelProvider {
  readonly type = 'bore'
  private tunnels: Map<string, BoreTunnelState> = new Map()
  private exitListeners: Map<string, (id: string) => void> = new Map()
  private processManager: ProcessManager

  constructor(processManager: ProcessManager) {
    this.processManager = processManager
  }

  async detect(): Promise<ProviderEnv> {
    return detectBore()
  }

  async install(): Promise<void> {
    await installBore()
  }

  async login(): Promise<ProviderAuthInfo> {
    return { status: 'not_required' }
  }

  async logout(): Promise<void> {
    // No-op for bore
  }

  getAuthStatus(): ProviderAuthInfo {
    return { status: 'not_required' }
  }

  async startTunnel(siteId: string, port: number, _opts?: TunnelOptions): Promise<string> {
    const config = getBoreConfig()
    if (!config) {
      throw new Error('請先設定 bore 伺服器')
    }

    const binaryPath = await findBinary()
    if (!binaryPath) {
      throw new Error('找不到 bore，請先安裝')
    }

    // Set starting state
    const state: BoreTunnelState = { siteId, status: 'starting' }
    this.tunnels.set(siteId, state)
    this.broadcastStatus(siteId)

    const processId = `${PROCESS_ID_PREFIX}${siteId}`

    // Build args: bore local <port> --to <serverAddr>:<serverPort> [--secret <secret>]
    const args = [
      'local', String(port),
      '--to', `${config.serverAddr}:${config.serverPort}`
    ]
    if (config.secret) {
      args.push('--secret', config.secret)
    }

    this.processManager.spawn(processId, binaryPath, args)

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
        log.debug(`bore stdout [${siteId}]: ${data}`)
        const url = this.parseUrlFromOutput(data, config.serverAddr)
        if (url) {
          cleanup()
          resolve(url)
        }
      }

      const onStderr = (id: string, data: string): void => {
        if (id !== processId) return
        log.debug(`bore stderr [${siteId}]: ${data}`)
        const url = this.parseUrlFromOutput(data, config.serverAddr)
        if (url) {
          cleanup()
          resolve(url)
        }
        if (data.includes('secret') && data.includes('mismatch')) {
          cleanup()
          const tunnel = this.tunnels.get(siteId)
          if (tunnel) {
            tunnel.status = 'error'
            tunnel.errorMessage = 'bore 伺服器 secret 不符，請檢查設定'
            this.broadcastStatus(siteId)
          }
          reject(new Error('bore 伺服器 secret 不符'))
        }
      }

      const onExit = (id: string, code: number | null): void => {
        if (id !== processId) return
        cleanup()
        const tunnel = this.tunnels.get(siteId)
        if (tunnel && tunnel.status !== 'running') {
          tunnel.status = 'error'
          tunnel.errorMessage = `bore 程式異常退出（代碼 ${code}）`
          this.broadcastStatus(siteId)
          reject(new Error(`bore exited with code ${code}`))
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
      const onProcessExit = (id: string): void => {
        if (id !== processId) return
        const t = this.tunnels.get(siteId)
        if (t && t.status === 'running') {
          t.status = 'stopped'
          t.publicUrl = undefined
          this.broadcastStatus(siteId)
        }
      }
      this.exitListeners.set(siteId, onProcessExit)
      this.processManager.on('exit', onProcessExit)

      return publicUrl
    } catch (err) {
      throw err
    }
  }

  async stopTunnel(siteId: string): Promise<void> {
    const processId = `${PROCESS_ID_PREFIX}${siteId}`
    const listener = this.exitListeners.get(siteId)
    if (listener) {
      this.processManager.removeListener('exit', listener)
      this.exitListeners.delete(siteId)
    }
    this.processManager.kill(processId)
    const tunnel = this.tunnels.get(siteId)
    if (tunnel) {
      tunnel.status = 'stopped'
      tunnel.publicUrl = undefined
      this.broadcastStatus(siteId)
    }
    this.tunnels.delete(siteId)
  }

  getTunnelInfo(siteId: string): ProviderTunnelInfo | undefined {
    const tunnel = this.tunnels.get(siteId)
    if (!tunnel) return undefined
    return {
      providerType: 'bore',
      status: tunnel.status,
      publicUrl: tunnel.publicUrl,
      errorMessage: tunnel.errorMessage,
    }
  }

  async restoreAll(_getSitePort: (siteId: string) => number | null): Promise<void> {
    // bore tunnels are not persistent — no restore needed
  }

  async stopAll(): Promise<void> {
    const siteIds = Array.from(this.tunnels.keys())
    for (const siteId of siteIds) {
      await this.stopTunnel(siteId)
    }
  }

  // -- Private helpers --

  /** Parse bore output for the listening URL */
  private parseUrlFromOutput(data: string, serverAddr: string): string | null {
    // bore output: "listening at <addr>:<port>"
    const match = data.match(/listening at\s+(\S+):(\d+)/)
    if (match) {
      return `http://${match[1]}:${match[2]}`
    }

    // Fallback: check for "remote port" pattern
    const portMatch = data.match(/remote port\s*[=:]\s*(\d+)/)
    if (portMatch) {
      return `http://${serverAddr}:${portMatch[1]}`
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
