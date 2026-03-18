import Store from 'electron-store'
import type { StoredSite } from '../shared/types'

interface StoreSchema {
  sites: StoredSite[]
}

const store = new Store<StoreSchema>({
  name: 'site-holder-data',
  defaults: {
    sites: []
  }
})

export function getSites(): StoredSite[] {
  try {
    const sites = store.get('sites')
    if (!Array.isArray(sites)) {
      // Data corrupted, reset to empty
      store.set('sites', [])
      return []
    }
    return sites
  } catch (err) {
    console.error('[Store] Failed to read sites, resetting to empty:', err)
    store.set('sites', [])
    return []
  }
}

export function saveSites(sites: StoredSite[]): void {
  try {
    store.set('sites', sites)
  } catch (err) {
    console.error('[Store] Failed to save sites:', err)
  }
}

export function addSite(site: StoredSite): void {
  const sites = getSites()
  sites.push(site)
  saveSites(sites)
}

export function removeSite(id: string): void {
  const sites = getSites()
  saveSites(sites.filter((s) => s.id !== id))
}
