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
  onShowShortcuts: () => void
}

export function useMenuCommands(options: UseMenuCommandsOptions): void {
  const optionsRef = useRef(options)
  optionsRef.current = options

  useEffect(() => {
    const findSelected = (): SiteInfo | undefined => {
      const { sites, selectedSiteId } = optionsRef.current
      return sites.find((s) => s.id === selectedSiteId)
    }

    const unsubAdd = window.electron.onMenuAddSite(() => optionsRef.current.onAddSite())
    const unsubSettings = window.electron.onMenuOpenSettings(() => optionsRef.current.onOpenSettings())

    const unsubOpen = window.electron.onMenuOpenInBrowser(() => {
      const site = findSelected()
      if (site && site.status === 'running') optionsRef.current.onOpenInBrowser(site)
    })

    const unsubRestart = window.electron.onMenuRestartServer(() => {
      const site = findSelected()
      if (site) optionsRef.current.onRestartServer(site)
    })

    const unsubRemove = window.electron.onMenuRemoveSite(() => {
      const site = findSelected()
      if (site) optionsRef.current.onRemoveSite(site)
    })

    const unsubShortcuts = window.electron.onMenuShowShortcuts(() => optionsRef.current.onShowShortcuts())

    return () => {
      unsubAdd()
      unsubSettings()
      unsubOpen()
      unsubRestart()
      unsubRemove()
      unsubShortcuts()
    }
  }, [])
}
