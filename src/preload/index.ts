import { contextBridge, ipcRenderer, webUtils, clipboard } from 'electron'
import type { SiteInfo, CloudflaredEnv, CloudflareAuth, TunnelInfo, ElectronAPI } from '../shared/types'

const electronAPI: ElectronAPI = {
  // Site management
  addSite: (name: string, folderPath: string): Promise<SiteInfo> => {
    return ipcRenderer.invoke('add-site', name, folderPath)
  },

  removeSite: (id: string): Promise<void> => {
    return ipcRenderer.invoke('remove-site', id)
  },

  getSites: (): Promise<SiteInfo[]> => {
    return ipcRenderer.invoke('get-sites')
  },

  // Server control
  startServer: (id: string): Promise<void> => {
    return ipcRenderer.invoke('start-server', id)
  },

  stopServer: (id: string): Promise<void> => {
    return ipcRenderer.invoke('stop-server', id)
  },

  // Browser
  openInBrowser: (id: string): Promise<void> => {
    return ipcRenderer.invoke('open-in-browser', id)
  },

  // Folder selection
  selectFolder: (): Promise<string | null> => {
    return ipcRenderer.invoke('select-folder')
  },

  // Drag-and-drop path resolution
  getPathForFile: (file: File): string => {
    return webUtils.getPathForFile(file)
  },

  // Clipboard
  readClipboardText: (): string => {
    return clipboard.readText()
  },

  onPasteShortcut: (callback: () => void): (() => void) => {
    const handler = (): void => {
      callback()
    }
    ipcRenderer.on('paste-shortcut', handler)
    return () => {
      ipcRenderer.removeListener('paste-shortcut', handler)
    }
  },

  // Event listeners
  onSiteUpdated: (callback: (sites: SiteInfo[]) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, sites: SiteInfo[]): void => {
      callback(sites)
    }
    ipcRenderer.on('site-updated', handler)
    return () => {
      ipcRenderer.removeListener('site-updated', handler)
    }
  },

  onFileChanged: (callback: (siteId: string) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, siteId: string): void => {
      callback(siteId)
    }
    ipcRenderer.on('file-changed', handler)
    return () => {
      ipcRenderer.removeListener('file-changed', handler)
    }
  },

  // --- Cloudflared Environment ---

  getCloudflaredStatus: (): Promise<CloudflaredEnv> => {
    return ipcRenderer.invoke('get-cloudflared-status')
  },

  installCloudflared: (): Promise<void> => {
    return ipcRenderer.invoke('install-cloudflared')
  },

  // --- Quick Tunnel ---

  startQuickTunnel: (siteId: string): Promise<string> => {
    return ipcRenderer.invoke('start-quick-tunnel', siteId)
  },

  stopTunnel: (siteId: string): Promise<void> => {
    return ipcRenderer.invoke('stop-tunnel', siteId)
  },

  // --- Cloudflare Auth ---

  loginCloudflare: (): Promise<CloudflareAuth> => {
    return ipcRenderer.invoke('login-cloudflare')
  },

  logoutCloudflare: (): Promise<void> => {
    return ipcRenderer.invoke('logout-cloudflare')
  },

  getAuthStatus: (): Promise<CloudflareAuth> => {
    return ipcRenderer.invoke('get-auth-status')
  },

  // --- Fixed Domain (Named Tunnel + DNS) ---

  bindFixedDomain: (siteId: string, domain: string): Promise<string> => {
    return ipcRenderer.invoke('bind-fixed-domain', siteId, domain)
  },

  unbindFixedDomain: (siteId: string): Promise<void> => {
    return ipcRenderer.invoke('unbind-fixed-domain', siteId)
  },

  startNamedTunnel: (siteId: string): Promise<void> => {
    return ipcRenderer.invoke('start-named-tunnel', siteId)
  },

  stopNamedTunnel: (siteId: string): Promise<void> => {
    return ipcRenderer.invoke('stop-named-tunnel', siteId)
  },

  // --- Cloudflared Event Listeners ---

  onCloudflaredStatusChanged: (callback: (env: CloudflaredEnv) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, env: CloudflaredEnv): void => {
      callback(env)
    }
    ipcRenderer.on('cloudflared-status-changed', handler)
    return () => {
      ipcRenderer.removeListener('cloudflared-status-changed', handler)
    }
  },

  onAuthStatusChanged: (callback: (auth: CloudflareAuth) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, auth: CloudflareAuth): void => {
      callback(auth)
    }
    ipcRenderer.on('auth-status-changed', handler)
    return () => {
      ipcRenderer.removeListener('auth-status-changed', handler)
    }
  },

  onTunnelStatusChanged: (
    callback: (siteId: string, tunnel: TunnelInfo | null) => void
  ): (() => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      siteId: string,
      tunnel: TunnelInfo | null
    ): void => {
      callback(siteId, tunnel)
    }
    ipcRenderer.on('tunnel-status-changed', handler)
    return () => {
      ipcRenderer.removeListener('tunnel-status-changed', handler)
    }
  }
}

contextBridge.exposeInMainWorld('electron', electronAPI)
