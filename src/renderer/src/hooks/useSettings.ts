import { useEffect, useState, useCallback } from 'react'
import { DEFAULT_SETTINGS } from '../../../shared/types'
import type { AppSettings } from '../../../shared/types'

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>({ ...DEFAULT_SETTINGS })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    window.electron.getSettings().then((s) => {
      setSettings(s)
      setLoading(false)
    }).catch(() => {
      setLoading(false)
    })

    const unsub = window.electron.onSettingsChanged((s) => {
      setSettings(s)
    })

    return unsub
  }, [])

  const update = useCallback(async (patch: Partial<AppSettings>) => {
    const updated = await window.electron.updateSettings(patch)
    setSettings(updated)
    return updated
  }, [])

  return { settings, loading, update }
}
