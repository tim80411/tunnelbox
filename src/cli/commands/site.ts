import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { Command } from 'commander'
import type { IStore } from '../../core/store-interface'
import type { StoredSite } from '../../shared/types'
import { CLIError } from '../errors'
import { output } from '../output'

export function siteAdd(store: IStore, name: string, folder: string, proxy?: string): StoredSite {
  if (store.getSites().some((s) => s.name === name)) {
    throw CLIError.input(`Site name already exists: ${name}`)
  }

  if (proxy) {
    // Proxy mode
    try {
      const parsed = new URL(proxy)
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error()
      }
    } catch {
      throw CLIError.input(`Invalid proxy URL: ${proxy}`)
    }
    const site: StoredSite = { id: randomUUID(), name, serveMode: 'proxy', proxyTarget: proxy }
    store.addSite(site)
    return site
  }

  // Static mode
  const folderPath = resolve(folder)
  if (!existsSync(folderPath)) {
    throw CLIError.input(`Folder not found: ${folderPath}`)
  }
  const site: StoredSite = { id: randomUUID(), name, serveMode: 'static', folderPath }
  store.addSite(site)
  return site
}

export function siteList(store: IStore): StoredSite[] {
  return store.getSites()
}

export function siteRemove(store: IStore, nameOrId: string): StoredSite {
  const sites = store.getSites()
  const site = sites.find((s) => s.name === nameOrId || s.id === nameOrId)
  if (!site) {
    throw CLIError.input(`Site not found: ${nameOrId}`)
  }
  store.removeSite(site.id)
  return site
}

export function registerSiteCommands(program: Command, store: IStore): void {
  const site = program.command('site').description('Manage sites')

  site
    .command('add <name> [folder]')
    .description('Add a new site (static or proxy)')
    .option('--proxy <url>', 'Proxy target URL (e.g. http://localhost:3000)')
    .action((name: string, folder: string | undefined, opts: { proxy?: string }) => {
      const json = program.opts().json
      try {
        if (opts.proxy) {
          const result = siteAdd(store, name, '', opts.proxy)
          output(
            json ? result : `Site added: ${result.name} (proxy -> ${result.serveMode === 'proxy' ? result.proxyTarget : ''})`,
            json,
          )
        } else {
          if (!folder) {
            throw CLIError.input('Folder path is required for static sites. Use --proxy <url> for proxy mode.')
          }
          const result = siteAdd(store, name, folder)
          output(
            json ? result : `Site added: ${result.name} (${result.serveMode === 'static' ? result.folderPath : ''})`,
            json,
          )
        }
      } catch (err) {
        handleError(err, json)
      }
    })

  site
    .command('list')
    .description('List all sites')
    .action(() => {
      const json = program.opts().json
      try {
        const sites = siteList(store)
        output(
          json
            ? sites
            : sites.map((s) => ({
                name: s.name,
                mode: s.serveMode,
                ...(s.serveMode === 'proxy' ? { target: s.proxyTarget } : { folder: s.folderPath }),
                id: s.id
              })),
          json,
        )
      } catch (err) {
        handleError(err, json)
      }
    })

  site
    .command('remove <nameOrId>')
    .description('Remove a site')
    .action((nameOrId: string) => {
      const json = program.opts().json
      try {
        const result = siteRemove(store, nameOrId)
        output(
          json ? result : `Site removed: ${result.name}`,
          json,
        )
      } catch (err) {
        handleError(err, json)
      }
    })
}

function handleError(err: unknown, json: boolean): never {
  const { handleError: handle } = require('../errors')
  handle(err, json)
}
