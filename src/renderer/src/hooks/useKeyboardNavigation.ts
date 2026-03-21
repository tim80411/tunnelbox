import { useState, useEffect, useCallback, useRef } from 'react'
import type { SiteInfo } from '../../../shared/types'
import { isFocusOnEditable } from '../utils/dom'

interface UseKeyboardNavigationOptions {
  sites: SiteInfo[]
  disabled?: boolean
}

interface UseKeyboardNavigationResult {
  selectedSiteId: string | null
  setSelectedSiteId: (id: string | null) => void
  listRef: React.RefObject<HTMLDivElement | null>
}

export function useKeyboardNavigation({
  sites,
  disabled = false
}: UseKeyboardNavigationOptions): UseKeyboardNavigationResult {
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)

  // Refs for stable keydown handler
  const sitesRef = useRef(sites)
  sitesRef.current = sites
  const selectedRef = useRef(selectedSiteId)
  selectedRef.current = selectedSiteId
  const disabledRef = useRef(disabled)
  disabledRef.current = disabled

  // Clear selection when the selected site is removed
  useEffect(() => {
    if (selectedSiteId && !sites.find((s) => s.id === selectedSiteId)) {
      setSelectedSiteId(null)
    }
  }, [sites, selectedSiteId])

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (disabledRef.current) return
    if (isFocusOnEditable()) return
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return

    const currentSites = sitesRef.current
    if (currentSites.length === 0) return

    e.preventDefault()

    const currentIndex = selectedRef.current
      ? currentSites.findIndex((s) => s.id === selectedRef.current)
      : -1

    let nextIndex: number
    if (e.key === 'ArrowDown') {
      nextIndex = currentIndex === -1 || currentIndex === currentSites.length - 1 ? 0 : currentIndex + 1
    } else {
      nextIndex = currentIndex <= 0 ? currentSites.length - 1 : currentIndex - 1
    }

    const nextSite = currentSites[nextIndex]
    setSelectedSiteId(nextSite.id)

    // Scroll the selected item into view
    const listEl = listRef.current
    if (listEl) {
      const itemEl = listEl.querySelector<HTMLElement>(`[data-site-id="${nextSite.id}"]`)
      itemEl?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  return { selectedSiteId, setSelectedSiteId, listRef }
}
