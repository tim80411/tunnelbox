import { describe, it, expect, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { isPackaged: false },
}))

import { ReconnectWindow } from '../../../src/main/cloudflared/reconnect-window'

describe('ReconnectWindow', () => {
  it('does not trip before reaching the attempt limit within the window', () => {
    const w = new ReconnectWindow({ maxAttempts: 5, windowMs: 60_000, cooldownMs: 60_000 })
    let now = 1000
    for (let i = 0; i < 4; i++) {
      w.recordAttempt(now)
      now += 1000
    }
    expect(w.shouldTrip(now)).toBe(false)
  })

  it('trips when the attempt limit is reached within the window', () => {
    const w = new ReconnectWindow({ maxAttempts: 5, windowMs: 60_000, cooldownMs: 60_000 })
    let now = 1000
    for (let i = 0; i < 5; i++) {
      w.recordAttempt(now)
      now += 5000 // 5 attempts spread across 25s, all within 60s
    }
    expect(w.shouldTrip(now)).toBe(true)
  })

  it('does NOT trip when attempts are spread beyond the window (old ones pruned)', () => {
    const w = new ReconnectWindow({ maxAttempts: 5, windowMs: 60_000, cooldownMs: 60_000 })
    let now = 0
    // 5 attempts, but each 20s apart -> by the 5th, the first two have aged out of the 60s window
    for (let i = 0; i < 5; i++) {
      w.recordAttempt(now)
      now += 20_000
    }
    // now = 80_000; window [20_000, 80_000] contains attempts at 20k,40k,60k,80k = 4 < 5
    expect(w.shouldTrip(now)).toBe(false)
  })

  it('enters cooldown and blocks retries until the cooldown elapses', () => {
    const w = new ReconnectWindow({ maxAttempts: 5, windowMs: 60_000, cooldownMs: 60_000 })
    const tripTime = 30_000
    w.startCooldown(tripTime)
    expect(w.isInCooldown(tripTime)).toBe(true)
    expect(w.isInCooldown(tripTime + 59_000)).toBe(true)
    expect(w.isInCooldown(tripTime + 60_000)).toBe(false)
    expect(w.isInCooldown(tripTime + 61_000)).toBe(false)
  })

  it('clears the window and cooldown on reset (e.g. successful connection)', () => {
    const w = new ReconnectWindow({ maxAttempts: 5, windowMs: 60_000, cooldownMs: 60_000 })
    let now = 1000
    for (let i = 0; i < 5; i++) {
      w.recordAttempt(now)
      now += 1000
    }
    expect(w.shouldTrip(now)).toBe(true)
    w.startCooldown(now)
    expect(w.isInCooldown(now)).toBe(true)

    w.reset()

    expect(w.shouldTrip(now)).toBe(false)
    expect(w.isInCooldown(now)).toBe(false)
    expect(w.attemptCount(now)).toBe(0)
  })

  it('allows retries again after the cooldown clears and the window has reset', () => {
    const w = new ReconnectWindow({ maxAttempts: 5, windowMs: 60_000, cooldownMs: 60_000 })
    let now = 1000
    for (let i = 0; i < 5; i++) {
      w.recordAttempt(now)
      now += 1000
    }
    expect(w.shouldTrip(now)).toBe(true)
    w.startCooldown(now)

    const afterCooldown = now + 61_000
    expect(w.isInCooldown(afterCooldown)).toBe(false)
    // After cooldown the stale attempts have all aged out of the 60s window
    expect(w.attemptCount(afterCooldown)).toBe(0)
    expect(w.shouldTrip(afterCooldown)).toBe(false)
  })

  it('reports the number of attempts currently inside the window', () => {
    const w = new ReconnectWindow({ maxAttempts: 5, windowMs: 60_000, cooldownMs: 60_000 })
    w.recordAttempt(0)
    w.recordAttempt(10_000)
    w.recordAttempt(70_000) // first attempt (t=0) now outside the 60s window
    expect(w.attemptCount(70_000)).toBe(2)
  })

  it('computes the exponential backoff delay from the in-window attempt count', () => {
    const w = new ReconnectWindow({
      maxAttempts: 5,
      windowMs: 60_000,
      cooldownMs: 60_000,
      backoffBaseMs: 2000,
    })
    expect(w.backoffDelay(0)).toBe(2000) // attempt #1 -> 2000 * 2^0
    w.recordAttempt(0)
    expect(w.backoffDelay(0)).toBe(4000) // attempt #2 -> 2000 * 2^1
    w.recordAttempt(0)
    expect(w.backoffDelay(0)).toBe(8000) // attempt #3 -> 2000 * 2^2
  })
})
