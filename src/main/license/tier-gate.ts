import type { TierState, VerifyResult } from '../../shared/license-types'
import { verifyLicense } from './verifier'

export interface TierGate {
  isPro(): boolean
  getTier(): 'free' | 'pro'
  getFounderTier(): number | null
  isSoftLocked(): boolean
  onChange(listener: (state: TierState) => void): () => void
  /** Reload license from disk and update cached state */
  refresh(): Promise<void>
}

type Listener = (state: TierState) => void

function resultToState(result: VerifyResult): TierState {
  if (!result.valid) {
    return { isPro: false, tier: 'free', softLocked: false, founderTier: null }
  }
  return {
    isPro: true,
    tier: 'pro',
    softLocked: result.soft_locked,
    founderTier: result.founder_tier
  }
}

class TierGateImpl implements TierGate {
  private state: TierState = { isPro: false, tier: 'free', softLocked: false, founderTier: null }
  private listeners = new Set<Listener>()

  isPro(): boolean {
    return this.state.isPro
  }

  getTier(): 'free' | 'pro' {
    return this.state.tier
  }

  getFounderTier(): number | null {
    return this.state.founderTier
  }

  isSoftLocked(): boolean {
    return this.state.softLocked
  }

  onChange(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  async refresh(): Promise<void> {
    const result = await verifyLicense()
    const next = resultToState(result)

    const changed =
      next.isPro !== this.state.isPro ||
      next.softLocked !== this.state.softLocked ||
      next.founderTier !== this.state.founderTier

    this.state = next

    if (changed) {
      for (const listener of this.listeners) {
        listener(this.state)
      }
    }
  }

  // Exposed for testing only
  _setState(state: TierState): void {
    this.state = state
  }

  // Dev-only: set state AND fire onChange listeners without touching disk
  _forceState(state: TierState): void {
    this.state = state
    for (const listener of this.listeners) {
      listener(this.state)
    }
  }
}

// Singleton — all callers in the main process share one cache with zero I/O per query
export const tierGate: TierGate & {
  _setState(s: TierState): void
  _forceState(s: TierState): void
} = new TierGateImpl()
