import type { Command } from 'commander'
import type { IStore } from '../../core/store-interface'
import type { ServerManager } from '../../main/server-manager'
import type { TunnelInfo } from '../../shared/types'
import { CLIError } from '../errors'
import { output, link } from '../output'
import { findSite } from './server'

/**
 * Dependencies injected to avoid Electron imports.
 */
export interface TunnelDeps {
  findBinary: () => Promise<string | null>
  startQuickTunnel: (siteId: string, port: number) => Promise<string>
  stopQuickTunnel: (siteId: string) => void
  hasTunnel: (siteId: string) => boolean
  getTunnelInfo: (siteId: string) => TunnelInfo | undefined
  /** When true, the Electron app manages servers — skip CLI-side auto-start. */
  delegatesServerManagement?: boolean
}

export interface TunnelQuickResult {
  id: string
  name: string
  publicUrl: string
  alreadyRunning?: boolean
  serverAutoStarted?: boolean
}

export interface TunnelStopResult {
  id: string
  name: string
  stopped?: boolean
  noTunnel?: boolean
}

/**
 * Start a quick tunnel for a site.
 * Auto-starts the server if not running.
 */
export async function tunnelQuick(
  store: IStore,
  serverManager: ServerManager,
  nameOrId: string,
  deps: TunnelDeps
): Promise<TunnelQuickResult> {
  // Check cloudflared installed first (skip when Electron manages it)
  if (!deps.delegatesServerManagement) {
    const binaryPath = await deps.findBinary()
    if (!binaryPath) {
      throw CLIError.system(
        'cloudflared not installed. Use `tunnelbox env install` to install it.'
      )
    }
  }

  const site = findSite(store, nameOrId)

  // Check if tunnel already running
  if (deps.hasTunnel(site.id)) {
    const info = deps.getTunnelInfo(site.id)
    return {
      id: site.id,
      name: site.name,
      publicUrl: info?.publicUrl || '',
      alreadyRunning: true,
    }
  }

  // When delegating to Electron, skip CLI-side server management.
  // Electron handles server auto-start internally.
  let port = 0
  let serverAutoStarted = false

  if (!deps.delegatesServerManagement) {
    const existing = serverManager.getServer(site.id)
    if (existing && existing.status === 'running') {
      port = existing.port
    } else {
      const server = await serverManager.startServer(site)
      port = server.port
      serverAutoStarted = true
    }
  }

  // Start quick tunnel (port is ignored when delegating to Electron)
  const publicUrl = await deps.startQuickTunnel(site.id, port)

  const result: TunnelQuickResult = {
    id: site.id,
    name: site.name,
    publicUrl,
  }
  if (serverAutoStarted) result.serverAutoStarted = true

  return result
}

/**
 * Stop a tunnel for a site.
 */
export async function tunnelStop(
  store: IStore,
  nameOrId: string,
  deps: TunnelDeps
): Promise<TunnelStopResult> {
  const site = findSite(store, nameOrId)

  // When delegating, always call stop — Electron handles the "no tunnel" case.
  if (!deps.delegatesServerManagement && !deps.hasTunnel(site.id)) {
    return {
      id: site.id,
      name: site.name,
      noTunnel: true,
    }
  }

  deps.stopQuickTunnel(site.id)

  return {
    id: site.id,
    name: site.name,
    stopped: true,
  }
}

/**
 * Register tunnel commands with commander.
 */
export function registerTunnelCommands(
  program: Command,
  store: IStore,
  serverManager: ServerManager,
  getDeps: () => TunnelDeps
): void {
  const tunnel = program.command('tunnel').description('Manage Cloudflare tunnels')

  tunnel
    .command('quick <nameOrId>')
    .description('Start a Quick Tunnel for a site')
    .action(async (nameOrId: string) => {
      const json = program.opts().json
      try {
        const result = await tunnelQuick(store, serverManager, nameOrId, getDeps())
        if (result.alreadyRunning) {
          output(
            json
              ? result
              : `Tunnel already running: ${link(result.publicUrl)}`,
            json
          )
        } else {
          const prefix = result.serverAutoStarted ? 'Server auto-started. ' : ''
          output(
            json
              ? result
              : `${prefix}Tunnel started: ${link(result.publicUrl)}`,
            json
          )
        }
      } catch (err) {
        const { handleError } = await import('../errors')
        handleError(err, json)
      }
    })

  tunnel
    .command('stop <nameOrId>')
    .description('Stop a tunnel for a site')
    .action(async (nameOrId: string) => {
      const json = program.opts().json
      try {
        const result = await tunnelStop(store, nameOrId, getDeps())
        if (result.noTunnel) {
          output(
            json
              ? result
              : `No tunnel running for "${result.name}"`,
            json
          )
        } else {
          output(
            json
              ? result
              : `Tunnel stopped for "${result.name}"`,
            json
          )
        }
      } catch (err) {
        const { handleError } = await import('../errors')
        handleError(err, json)
      }
    })
}
