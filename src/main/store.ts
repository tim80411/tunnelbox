import Store from 'electron-store'
import type { StoredSite, StoredAuth, StoredTunnel } from '../shared/types'

interface StoreSchema {
  sites: StoredSite[]
  auth: StoredAuth | null
  tunnels: StoredTunnel[]
}

const store = new Store<StoreSchema>({
  name: 'site-holder-data',
  defaults: {
    sites: [],
    auth: null,
    tunnels: []
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

// --- Auth ---

export function getAuth(): StoredAuth | null {
  try {
    return store.get('auth') || null
  } catch (err) {
    console.error('[Store] Failed to read auth:', err)
    return null
  }
}

export function saveAuth(auth: StoredAuth): void {
  try {
    store.set('auth', auth)
  } catch (err) {
    console.error('[Store] Failed to save auth:', err)
  }
}

export function clearAuth(): void {
  try {
    store.set('auth', null)
  } catch (err) {
    console.error('[Store] Failed to clear auth:', err)
  }
}

// --- Named Tunnels ---

export function getTunnels(): StoredTunnel[] {
  try {
    const tunnels = store.get('tunnels')
    if (!Array.isArray(tunnels)) {
      store.set('tunnels', [])
      return []
    }
    return tunnels
  } catch (err) {
    console.error('[Store] Failed to read tunnels:', err)
    return []
  }
}

export function saveTunnel(tunnel: StoredTunnel): void {
  const tunnels = getTunnels().filter((t) => t.siteId !== tunnel.siteId)
  tunnels.push(tunnel)
  try {
    store.set('tunnels', tunnels)
  } catch (err) {
    console.error('[Store] Failed to save tunnel:', err)
  }
}

export function removeTunnel(siteId: string): void {
  const tunnels = getTunnels()
  try {
    store.set('tunnels', tunnels.filter((t) => t.siteId !== siteId))
  } catch (err) {
    console.error('[Store] Failed to remove tunnel:', err)
  }
}
