import { useEffect, useState, useCallback, useRef } from 'react'
import type { UpdateState, ForceUpdateCheckResult } from '../../../shared/update-types'

export function useAutoUpdate() {
  const [state, setState] = useState<UpdateState>({ phase: 'idle' })
  const [appVersion, setAppVersion] = useState('')
  const [forceUpdate, setForceUpdate] = useState<ForceUpdateCheckResult | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const lastPhaseRef = useRef<string>('idle')

  useEffect(() => {
    // Load initial state
    window.electron.getAppVersion().then(setAppVersion).catch(() => {})
    window.electron.getUpdateState().then(setState).catch(() => {})

    // Check force update
    window.electron.checkForceUpdate()
      .then(setForceUpdate)
      .catch(() => setForceUpdate({ blocked: false, config: null, currentVersion: '' }))

    // Subscribe to state changes — clear dismissed when phase changes
    const unsub = window.electron.onUpdateStateChanged((s) => {
      if (s.phase !== lastPhaseRef.current) {
        setDismissed(false)
        lastPhaseRef.current = s.phase
      }
      setState(s)
    })
    return unsub
  }, [])

  const checkForUpdates = useCallback(async () => {
    setDismissed(false)
    await window.electron.checkForUpdates()
  }, [])

  const downloadUpdate = useCallback(async () => {
    await window.electron.downloadUpdate()
  }, [])

  const installUpdate = useCallback(async () => {
    await window.electron.installUpdate()
  }, [])

  const dismissUpdate = useCallback(() => {
    setDismissed(true)
  }, [])

  // Effective state: hide update UI when dismissed
  const effectiveState: UpdateState = dismissed ? { phase: 'idle' } : state

  return {
    state: effectiveState,
    appVersion,
    forceUpdate,
    checkForUpdates,
    downloadUpdate,
    installUpdate,
    dismissUpdate
  }
}
