import type { StoredSite, StoredAuth, StoredTunnel } from '../shared/types'

export interface StoredDomainBinding {
  siteId: string
  domain: string
}

export interface IStore {
  getSites(): StoredSite[]
  saveSites(sites: StoredSite[]): void
  addSite(site: StoredSite): void
  removeSite(id: string): void
  getAuth(): StoredAuth | null
  saveAuth(auth: StoredAuth): void
  clearAuth(): void
  getTunnels(): StoredTunnel[]
  saveTunnel(tunnel: StoredTunnel): void
  removeTunnel(siteId: string): void
  getDomainBinding(siteId: string): StoredDomainBinding | null
  saveDomainBinding(siteId: string, domain: string): void
  removeDomainBinding(siteId: string): void
}
