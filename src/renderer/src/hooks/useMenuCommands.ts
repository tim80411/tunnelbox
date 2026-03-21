import { useEffect } from 'react'
import type { SiteInfo } from '../../../shared/types'

interface UseMenuCommandsOptions {
  sites: SiteInfo[]
  selectedSiteId: string | null
  onAddSite: () => void
  onOpenSettings: () => void
  onOpenInBrowser: (site: SiteInfo) => void
  onRestartServer: (site: SiteInfo) => void
  onRemoveSite: (site: SiteInfo) => void
}

export function useMenuCommands({
  sites,
  selectedSiteId,
  onAddSite,
  onOpenSettings,
  onOpenInBrowser,
  onRestartServer,
  onRemoveSite
}: UseMenuCommandsOptions): void {
  useEffect(() => {
    const unsubAdd = window.electron.onMenuAddSite(onAddSite)
    const unsubSettings = window.electron.onMenuOpenSettings(onOpenSettings)

    const unsubOpen = window.electron.onMenuOpenInBrowser(() => {
      const site = sites.find((s) => s.id === selectedSiteId)
      if (site && site.status === 'running') onOpenInBrowser(site)
    })

    const unsubRestart = window.electron.onMenuRestartServer(() => {
      const site = sites.find((s) => s.id === selectedSiteId)
      if (site) onRestartServer(site)
    })

    const unsubRemove = window.electron.onMenuRemoveSite(() => {
      const site = sites.find((s) => s.id === selectedSiteId)
      if (site) onRemoveSite(site)
    })

    return () => {
      unsubAdd()
      unsubSettings()
      unsubOpen()
      unsubRestart()
      unsubRemove()
    }
  }, [sites, selectedSiteId, onAddSite, onOpenSettings, onOpenInBrowser, onRestartServer, onRemoveSite])
}
