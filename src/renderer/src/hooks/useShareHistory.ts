import { useEffect, useState, useCallback } from 'react'
import type { ShareRecord } from '../../../shared/types'

export function useShareHistory() {
  const [records, setRecords] = useState<ShareRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const data = await window.electron.getShareHistory()
      setRecords(data)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load share history')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()

    const unsub = window.electron.onShareHistoryChanged((updatedRecords) => {
      setRecords(updatedRecords)
    })

    return unsub
  }, [refresh])

  const exportCsv = useCallback(async () => {
    try {
      setError(null)
      const result = await window.electron.exportShareHistory()
      return result
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to export share history')
      return false
    }
  }, [])

  return { records, loading, error, refresh, exportCsv }
}
