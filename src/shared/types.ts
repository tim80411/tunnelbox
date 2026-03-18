export interface SiteInfo {
  id: string
  name: string
  folderPath: string
  port: number
  status: 'running' | 'stopped' | 'error'
  url: string // e.g., "http://localhost:3001"
}

export interface StoredSite {
  id: string
  name: string
  folderPath: string
}

export interface ElectronAPI {
  // Site management
  addSite: (name: string, folderPath: string) => Promise<SiteInfo>
  removeSite: (id: string) => Promise<void>
  getSites: () => Promise<SiteInfo[]>

  // Server control
  startServer: (id: string) => Promise<void>
  stopServer: (id: string) => Promise<void>

  // Browser
  openInBrowser: (id: string) => Promise<void>

  // Folder selection
  selectFolder: () => Promise<string | null>

  // Event listeners
  onSiteUpdated: (callback: (sites: SiteInfo[]) => void) => () => void
  onFileChanged: (callback: (siteId: string) => void) => () => void
}

declare global {
  interface Window {
    electron: ElectronAPI
  }
}
