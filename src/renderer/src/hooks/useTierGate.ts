import { useEffect, useState } from 'react'
import type { TierState } from '../../../shared/license-types'

const DEFAULT_STATE: TierState = { isPro: false, tier: 'free', softLocked: false, founderTier: null }

export function useTierGate(): TierState {
  const [state, setState] = useState<TierState>(DEFAULT_STATE)

  useEffect(() => {
    window.electron.tierGate.getState().then(setState).catch(() => {})
    return window.electron.tierGate.onChange(setState)
  }, [])

  return state
}
