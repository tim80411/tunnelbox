import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { dirname, join } from 'path'
import { homedir } from 'os'
import type { StoredSite, StoredAuth, StoredTunnel } from '../shared/types'
import type { IStore, StoredDomainBinding } from './store-interface'

interface StoreData {
  sites: StoredSite[]
  auth: StoredAuth | null
  tunnels: StoredTunnel[]
  domainBindings: StoredDomainBinding[]
}

function getDefaults(): StoreData {
  return {
    sites: [],
    auth: null,
    tunnels: [],
    domainBindings: [],
  }
}

export function getDefaultStorePath(): string {
  const platform = process.platform
  if (platform === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', 'tunnelbox', 'tunnelbox-data.json')
  } else if (platform === 'win32') {
    return join(
      process.env.APPDATA || join(homedir(), 'AppData', 'Roaming'),
      'tunnelbox',
      'tunnelbox-data.json',
    )
  }
  return join(homedir(), '.config', 'tunnelbox', 'tunnelbox-data.json')
}

export class FileStore implements IStore {
  private filePath: string

  constructor(filePath?: string) {
    this.filePath = filePath ?? getDefaultStorePath()
  }

  private read(): StoreData {
    try {
      const raw = readFileSync(this.filePath, 'utf-8')
      const data = JSON.parse(raw)
      return { ...getDefaults(), ...data }
    } catch {
      return getDefaults()
    }
  }

  private write(data: StoreData): void {
    mkdirSync(dirname(this.filePath), { recursive: true })
    writeFileSync(this.filePath, JSON.stringify(data, null, 2), 'utf-8')
  }

  getSites(): StoredSite[] {
    return this.read().sites
  }

  saveSites(sites: StoredSite[]): void {
    const data = this.read()
    data.sites = sites
    this.write(data)
  }

  addSite(site: StoredSite): void {
    const data = this.read()
    data.sites.push(site)
    this.write(data)
  }

  removeSite(id: string): void {
    const data = this.read()
    data.sites = data.sites.filter((s) => s.id !== id)
    this.write(data)
  }

  getAuth(): StoredAuth | null {
    return this.read().auth
  }

  saveAuth(auth: StoredAuth): void {
    const data = this.read()
    data.auth = auth
    this.write(data)
  }

  clearAuth(): void {
    const data = this.read()
    data.auth = null
    this.write(data)
  }

  getTunnels(): StoredTunnel[] {
    return this.read().tunnels
  }

  saveTunnel(tunnel: StoredTunnel): void {
    const data = this.read()
    data.tunnels = data.tunnels.filter((t) => t.siteId !== tunnel.siteId)
    data.tunnels.push(tunnel)
    this.write(data)
  }

  removeTunnel(siteId: string): void {
    const data = this.read()
    data.tunnels = data.tunnels.filter((t) => t.siteId !== siteId)
    this.write(data)
  }

  getDomainBinding(siteId: string): StoredDomainBinding | null {
    const data = this.read()
    return data.domainBindings.find((b) => b.siteId === siteId) ?? null
  }

  saveDomainBinding(siteId: string, domain: string): void {
    const data = this.read()
    data.domainBindings = data.domainBindings.filter((b) => b.siteId !== siteId)
    data.domainBindings.push({ siteId, domain })
    this.write(data)
  }

  removeDomainBinding(siteId: string): void {
    const data = this.read()
    data.domainBindings = data.domainBindings.filter((b) => b.siteId !== siteId)
    this.write(data)
  }
}
