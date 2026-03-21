import { useEffect, useRef } from 'react'
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

export function useMenuCommands(options: UseMenuCommandsOptions): void {
  const optionsRef = useRef(options)
  optionsRef.current = options

  useEffect(() => {
    const unsubAdd = window.electron.onMenuAddSite(() => optionsRef.current.onAddSite())
    const unsubSettings = window.electron.onMenuOpenSettings(() => optionsRef.current.onOpenSettings())

    const unsubOpen = window.electron.onMenuOpenInBrowser(() => {
      const { sites, selectedSiteId, onOpenInBrowser } = optionsRef.current
      const site = sites.find((s) => s.id === selectedSiteId)
      if (site && site.status === 'running') onOpenInBrowser(site)
    })

    const unsubRestart = window.electron.onMenuRestartServer(() => {
      const { sites, selectedSiteId, onRestartServer } = optionsRef.current
      const site = sites.find((s) => s.id === selectedSiteId)
      if (site) onRestartServer(site)
    })

    const unsubRemove = window.electron.onMenuRemoveSite(() => {
      const { sites, selectedSiteId, onRemoveSite } = optionsRef.current
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
  }, [])
}
