import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { Command } from 'commander'
import type { IStore } from '../../core/store-interface'
import type { StoredSite } from '../../shared/types'
import { CLIError } from '../errors'
import { output } from '../output'

export function siteAdd(store: IStore, name: string, folder: string): StoredSite {
  const folderPath = resolve(folder)
  if (!existsSync(folderPath)) {
    throw CLIError.input(`Folder not found: ${folderPath}`)
  }
  if (store.getSites().some((s) => s.name === name)) {
    throw CLIError.input(`Site name already exists: ${name}`)
  }
  const site: StoredSite = { id: randomUUID(), name, folderPath }
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
  const site = program.command('site').description('Manage static sites')

  site
    .command('add <name> <folder>')
    .description('Add a new site')
    .action((name: string, folder: string) => {
      const json = program.opts().json
      try {
        const result = siteAdd(store, name, folder)
        output(
          json ? result : `Site added: ${result.name} (${result.folderPath})`,
          json,
        )
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
            : sites.map((s) => ({ name: s.name, folder: s.folderPath, id: s.id })),
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
