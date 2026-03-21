import { useState, useEffect, useCallback, useRef } from 'react'
import type { SiteInfo } from '../../../shared/types'

interface UseKeyboardNavigationResult {
  selectedSiteId: string | null
  setSelectedSiteId: (id: string | null) => void
  listRef: React.RefObject<HTMLDivElement | null>
}

export function useKeyboardNavigation(sites: SiteInfo[]): UseKeyboardNavigationResult {
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)

  // Clear selection when the selected site is removed
  useEffect(() => {
    if (selectedSiteId && !sites.find((s) => s.id === selectedSiteId)) {
      setSelectedSiteId(null)
    }
  }, [sites, selectedSiteId])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Skip when an editable element is focused
      const el = document.activeElement as HTMLElement | null
      const tag = el?.tagName?.toLowerCase()
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || el?.isContentEditable) return

      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
      if (sites.length === 0) return

      e.preventDefault()

      const currentIndex = selectedSiteId
        ? sites.findIndex((s) => s.id === selectedSiteId)
        : -1

      let nextIndex: number
      if (e.key === 'ArrowDown') {
        nextIndex = currentIndex === -1 || currentIndex === sites.length - 1 ? 0 : currentIndex + 1
      } else {
        nextIndex = currentIndex <= 0 ? sites.length - 1 : currentIndex - 1
      }

      const nextSite = sites[nextIndex]
      setSelectedSiteId(nextSite.id)

      // Scroll the selected item into view
      const listEl = listRef.current
      if (listEl) {
        const itemEl = listEl.querySelector<HTMLElement>(`[data-site-id="${nextSite.id}"]`)
        itemEl?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
      }
    },
    [sites, selectedSiteId]
  )

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  return { selectedSiteId, setSelectedSiteId, listRef }
}
