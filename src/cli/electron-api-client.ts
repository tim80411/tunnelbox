import http from 'node:http'
import { readApiInfo, deleteApiInfo } from '../core/api-discovery'
import { CLIError } from './errors'
import type { TunnelDeps } from './commands/tunnel'
import type { TunnelInfo } from '../shared/types'
import { findBinary } from './cloudflared-cli'

const REQUEST_TIMEOUT_MS = 35_000

interface ApiResponse {
  [key: string]: unknown
}

/**
 * Check if the TunnelBox Electron app is running by reading the API discovery file
 * and verifying the PID is alive.
 */
export function isElectronRunning(): boolean {
  const info = readApiInfo()
  if (!info) return false

  try {
    process.kill(info.pid, 0)
    return true
  } catch {
    deleteApiInfo() // clean up stale file from crashed Electron
    return false
  }
}

/**
 * Make an HTTP request to the local Electron API server.
 */
function apiRequest(port: number, method: string, path: string, body?: Record<string, unknown>): Promise<ApiResponse> {
  return new Promise((resolve, reject) => {
    const postData = body ? JSON.stringify(body) : undefined

    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path,
        method,
        headers: postData
          ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) }
          : undefined,
        timeout: REQUEST_TIMEOUT_MS,
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (chunk: Buffer) => chunks.push(chunk))
        res.on('error', (err: Error) => {
          reject(CLIError.system(`API response error: ${err.message}`))
        })
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf-8')
          try {
            const data = JSON.parse(raw) as ApiResponse
            if (res.statusCode && res.statusCode >= 400) {
              const errorMsg = (data.error as string) || `API error (${res.statusCode})`
              if (res.statusCode >= 500) {
                reject(CLIError.system(errorMsg))
              } else {
                reject(CLIError.input(errorMsg))
              }
            } else {
              resolve(data)
            }
          } catch {
            reject(CLIError.system(`Invalid API response: ${raw}`))
          }
        })
      },
    )

    req.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'ECONNREFUSED') {
        reject(CLIError.system('TunnelBox app is not responding. Please restart it.'))
      } else {
        reject(CLIError.system(`API connection error: ${err.message}`))
      }
    })

    req.on('timeout', () => {
      req.destroy()
      reject(CLIError.system('Tunnel start timed out (35s). Check your network connection.'))
    })

    if (postData) req.write(postData)
    req.end()
  })
}

/**
 * Create a TunnelDeps implementation that delegates to the running Electron app.
 */
export function createElectronApiClient(): TunnelDeps {
  const info = readApiInfo()
  if (!info) {
    throw CLIError.system('TunnelBox app is not running. Please open TunnelBox first.')
  }
  const apiPort = info.port

  return {
    findBinary,
    delegatesServerManagement: true,

    async startQuickTunnel(siteId: string, _port: number): Promise<string> {
      const res = await apiRequest(apiPort, 'POST', '/tunnel/quick', { siteId })
      return res.publicUrl as string
    },

    stopQuickTunnel(siteId: string): void {
      // Fire-and-forget: the Electron app handles cleanup
      apiRequest(apiPort, 'POST', '/tunnel/stop', { siteId }).catch(() => {
        // Errors are acceptable here (app may have quit)
      })
    },

    hasTunnel(_siteId: string): boolean {
      // Cannot make sync HTTP call. Return false so tunnelQuick doesn't short-circuit.
      // tunnelStop is guarded by delegatesServerManagement to always call stopQuickTunnel.
      return false
    },

    getTunnelInfo(_siteId: string): TunnelInfo | undefined {
      // Tunnel info is managed by Electron, not queryable synchronously.
      return undefined
    },
  }
}
