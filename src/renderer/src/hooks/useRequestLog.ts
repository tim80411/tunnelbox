import { useEffect, useState, useCallback } from 'react'
import type { RequestLogEntry } from '../../../shared/types'

export function useRequestLog(siteId: string | null) {
  const [entries, setEntries] = useState<RequestLogEntry[]>([])
  const [selectedEntry, setSelectedEntry] = useState<RequestLogEntry | null>(null)

  const refresh = useCallback(async () => {
    if (!siteId) {
      setEntries([])
      return
    }
    try {
      const logs = await window.electron.getRequestLog(siteId)
      setEntries(logs)
    } catch {
      // non-critical
    }
  }, [siteId])

  useEffect(() => {
    refresh()

    const unsub = window.electron.onRequestLogEntry((entry) => {
      if (entry.siteId === siteId) {
        setEntries((prev) => [entry, ...prev])
      }
    })

    return unsub
  }, [siteId, refresh])

  const clearLog = useCallback(async () => {
    if (!siteId) return
    try {
      await window.electron.clearRequestLog(siteId)
      setEntries([])
      setSelectedEntry(null)
    } catch {
      // non-critical
    }
  }, [siteId])

  return { entries, selectedEntry, setSelectedEntry, clearLog }
}
