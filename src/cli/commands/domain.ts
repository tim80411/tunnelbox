import type { Command } from 'commander'
import type { IStore } from '../../core/store-interface'
import type { CloudflareAuth } from '../../shared/types'
import { CLIError } from '../errors'
import { output, link } from '../output'
import { findSite } from './server'

export interface DomainDeps {
  bind: (siteId: string, domain: string) => Promise<string>
  unbind: (siteId: string) => Promise<void>
  getAuthStatus: () => Promise<CloudflareAuth>
}

export interface DomainBindResult {
  id: string
  name: string
  domain: string
  publicUrl: string
}

export interface DomainUnbindResult {
  id: string
  name: string
  message: string
}

/**
 * Bind a fixed domain to a site.
 */
export async function domainBind(
  store: IStore,
  nameOrId: string,
  domain: string,
  deps: DomainDeps
): Promise<DomainBindResult> {
  const auth = await deps.getAuthStatus()
  if (auth.status !== 'logged_in') {
    throw CLIError.input('Not logged in. Use `tunnelbox auth login` to login first.')
  }

  const site = findSite(store, nameOrId)
  const publicUrl = await deps.bind(site.id, domain)

  return {
    id: site.id,
    name: site.name,
    domain,
    publicUrl,
  }
}

/**
 * Unbind a fixed domain from a site.
 */
export async function domainUnbind(
  store: IStore,
  nameOrId: string,
  deps: DomainDeps
): Promise<DomainUnbindResult> {
  const auth = await deps.getAuthStatus()
  if (auth.status !== 'logged_in') {
    throw CLIError.input('Not logged in. Use `tunnelbox auth login` to login first.')
  }

  const site = findSite(store, nameOrId)

  try {
    await deps.unbind(site.id)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('找不到') || msg.includes('not found')) {
      return { id: site.id, name: site.name, message: 'No domain binding found' }
    }
    throw err
  }

  return {
    id: site.id,
    name: site.name,
    message: 'Domain unbound successfully',
  }
}

/**
 * Register domain commands with commander.
 */
export function registerDomainCommands(
  program: Command,
  store: IStore,
  getDeps: () => DomainDeps
): void {
  const domainCmd = program.command('domain').description('Manage fixed domain bindings')

  domainCmd
    .command('bind <nameOrId> <domain>')
    .description('Bind a fixed domain to a site')
    .action(async (nameOrId: string, domain: string) => {
      const json = program.opts().json
      try {
        const result = await domainBind(store, nameOrId, domain, getDeps())
        if (json) {
          output(result, true)
        } else {
          output(`Domain bound: ${link(result.publicUrl)}`, false)
        }
      } catch (err) {
        const { handleError } = await import('../errors')
        handleError(err, json)
      }
    })

  domainCmd
    .command('unbind <nameOrId>')
    .description('Unbind a fixed domain from a site')
    .action(async (nameOrId: string) => {
      const json = program.opts().json
      try {
        const result = await domainUnbind(store, nameOrId, getDeps())
        output(json ? result : result.message, json)
      } catch (err) {
        const { handleError } = await import('../errors')
        handleError(err, json)
      }
    })
}
