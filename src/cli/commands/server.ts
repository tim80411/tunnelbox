import type { Command } from 'commander'
import type { IStore } from '../../core/store-interface'
import type { ServerManager } from '../../main/server-manager'
import type { StoredSite } from '../../shared/types'
import { CLIError } from '../errors'
import { output, link, printLanQr } from '../output'
import { getLanIp } from '../../core/lan-ip'

/**
 * Look up a site by name or id. Throws CLIError (exit 1) if not found.
 */
export function findSite(store: IStore, nameOrId: string): StoredSite {
  const sites = store.getSites()
  const site = sites.find((s) => s.name === nameOrId || s.id === nameOrId)
  if (!site) {
    throw CLIError.input(`Site not found: ${nameOrId}`)
  }
  return site
}

export interface ServerStartResult {
  id: string
  name: string
  port: number
  url: string
  lanUrl?: string
  alreadyRunning?: boolean
}

export interface ServerStopResult {
  id: string
  name: string
  stopped?: boolean
  alreadyStopped?: boolean
}

/**
 * Start a server for the given site (by name or id).
 * Returns port/url info. If already running, returns existing info.
 */
export async function serverStart(
  store: IStore,
  serverManager: ServerManager,
  nameOrId: string
): Promise<ServerStartResult> {
  const site = findSite(store, nameOrId)

  // Check if already running
  const existing = serverManager.getServer(site.id)
  if (existing && existing.status === 'running') {
    const lanIp = getLanIp()
    const result: ServerStartResult = {
      id: site.id,
      name: site.name,
      port: existing.port,
      url: `http://localhost:${existing.port}`,
      alreadyRunning: true,
    }
    if (lanIp) {
      result.lanUrl = `http://${lanIp}:${existing.port}`
    }
    return result
  }

  const server = await serverManager.startServer(site)

  const lanIp = getLanIp()
  const result: ServerStartResult = {
    id: site.id,
    name: site.name,
    port: server.port,
    url: `http://localhost:${server.port}`,
  }
  if (lanIp) {
    result.lanUrl = `http://${lanIp}:${server.port}`
  }
  return result
}

/**
 * Stop a server for the given site (by name or id).
 */
export async function serverStop(
  store: IStore,
  serverManager: ServerManager,
  nameOrId: string
): Promise<ServerStopResult> {
  const site = findSite(store, nameOrId)

  const existing = serverManager.getServer(site.id)
  if (!existing || existing.status !== 'running') {
    return {
      id: site.id,
      name: site.name,
      alreadyStopped: true,
    }
  }

  await serverManager.stopServer(site.id)

  return {
    id: site.id,
    name: site.name,
    stopped: true,
  }
}

/**
 * Register server commands with commander.
 */
export function registerServerCommands(
  program: Command,
  store: IStore,
  serverManager: ServerManager
): void {
  const server = program.command('server').description('Manage local servers')

  server
    .command('start <nameOrId>')
    .description('Start a local server for a site')
    .action(async (nameOrId: string) => {
      const json = program.opts().json
      try {
        const result = await serverStart(store, serverManager, nameOrId)
        if (json) {
          output(result, json)
        } else {
          const lanLine = result.lanUrl ? `\n  LAN: ${link(result.lanUrl)}` : ''
          if (result.alreadyRunning) {
            output(`Server already running at ${link(result.url)}${lanLine}`, json)
          } else {
            output(`Server started at ${link(result.url)}${lanLine}`, json)
          }
          if (result.lanUrl) {
            await printLanQr(result.lanUrl).catch(() => {/* QR unavailable, non-fatal */})
          }
        }
      } catch (err) {
        const { handleError } = await import('../errors')
        handleError(err, json)
      }
    })

  server
    .command('stop <nameOrId>')
    .description('Stop a local server for a site')
    .action(async (nameOrId: string) => {
      const json = program.opts().json
      try {
        const result = await serverStop(store, serverManager, nameOrId)
        if (result.alreadyStopped) {
          output(
            json
              ? result
              : `Server is not running for "${result.name}"`,
            json
          )
        } else {
          output(
            json
              ? result
              : `Server stopped for "${result.name}"`,
            json
          )
        }
      } catch (err) {
        const { handleError } = await import('../errors')
        handleError(err, json)
      }
    })
}
