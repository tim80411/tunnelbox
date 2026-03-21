import Store from 'electron-store'
import { createLogger } from './logger'
import type { StoredSite, StoredAuth, StoredTunnel } from '../shared/types'

const log = createLogger('Store')

interface StoredDomainBinding {
  siteId: string
  domain: string
}

interface StoreSchema {
  sites: StoredSite[]
  auth: StoredAuth | null
  tunnels: StoredTunnel[]
  domainBindings: StoredDomainBinding[]
}

const store = new Store<StoreSchema>({
  name: 'tunnelbox-data',
  defaults: {
    sites: [],
    auth: null,
    tunnels: [],
    domainBindings: []
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
    log.error(' Failed to read sites, resetting to empty:', err)
    store.set('sites', [])
    return []
  }
}

export function saveSites(sites: StoredSite[]): void {
  try {
    store.set('sites', sites)
  } catch (err) {
    log.error(' Failed to save sites:', err)
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

export function updateSite(id: string, patch: Partial<StoredSite>): void {
  const sites = getSites()
  const idx = sites.findIndex((s) => s.id === id)
  if (idx === -1) return
  sites[idx] = { ...sites[idx], ...patch }
  saveSites(sites)
}

// --- Auth ---

export function getAuth(): StoredAuth | null {
  try {
    return store.get('auth') || null
  } catch (err) {
    log.error(' Failed to read auth:', err)
    return null
  }
}

export function saveAuth(auth: StoredAuth): void {
  try {
    store.set('auth', auth)
  } catch (err) {
    log.error(' Failed to save auth:', err)
  }
}

export function clearAuth(): void {
  try {
    store.set('auth', null)
  } catch (err) {
    log.error(' Failed to clear auth:', err)
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
    log.error(' Failed to read tunnels:', err)
    return []
  }
}

export function saveTunnel(tunnel: StoredTunnel): void {
  const tunnels = getTunnels().filter((t) => t.siteId !== tunnel.siteId)
  tunnels.push(tunnel)
  try {
    store.set('tunnels', tunnels)
  } catch (err) {
    log.error(' Failed to save tunnel:', err)
  }
}

export function removeTunnel(siteId: string): void {
  const tunnels = getTunnels()
  try {
    store.set('tunnels', tunnels.filter((t) => t.siteId !== siteId))
  } catch (err) {
    log.error(' Failed to remove tunnel:', err)
  }
}

// --- Domain Bindings ---

export function getDomainBinding(siteId: string): StoredDomainBinding | null {
  try {
    const bindings = store.get('domainBindings') || []
    return bindings.find((b) => b.siteId === siteId) || null
  } catch (err) {
    log.error(' Failed to read domain binding:', err)
    return null
  }
}

export function saveDomainBinding(siteId: string, domain: string): void {
  try {
    const bindings = (store.get('domainBindings') || []).filter((b) => b.siteId !== siteId)
    bindings.push({ siteId, domain })
    store.set('domainBindings', bindings)
  } catch (err) {
    log.error(' Failed to save domain binding:', err)
  }
}

export function removeDomainBinding(siteId: string): void {
  try {
    const bindings = store.get('domainBindings') || []
    store.set('domainBindings', bindings.filter((b) => b.siteId !== siteId))
  } catch (err) {
    log.error(' Failed to remove domain binding:', err)
  }
}
