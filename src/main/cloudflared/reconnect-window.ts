/**
 * Sliding-window reconnect limiter for the tunnel watchdog (TIM-222).
 *
 * Instead of a fixed "N total retries" cap, this tracks reconnect attempt
 * timestamps inside a sliding time window. When too many attempts pile up
 * inside the window the caller should transition the tunnel to an error state
 * and enter a cooldown; once the cooldown elapses, retries are allowed again
 * and the window naturally clears as stale attempts age out.
 *
 * Pure / time-injectable so the counter logic is unit-testable without timers.
 */
export interface ReconnectWindowOptions {
  /** Max attempts allowed inside the window before tripping. */
  maxAttempts: number
  /** Width of the sliding window, in ms. */
  windowMs: number
  /** How long to stay in cooldown after tripping, in ms. */
  cooldownMs: number
  /** Base delay for exponential backoff between attempts, in ms. */
  backoffBaseMs?: number
}

export class ReconnectWindow {
  private readonly maxAttempts: number
  private readonly windowMs: number
  private readonly cooldownMs: number
  private readonly backoffBaseMs: number

  /** Timestamps (ms) of recent reconnect attempts, oldest first. */
  private attempts: number[] = []
  /** Timestamp (ms) at which the current cooldown started, or null. */
  private cooldownStart: number | null = null

  constructor(opts: ReconnectWindowOptions) {
    this.maxAttempts = opts.maxAttempts
    this.windowMs = opts.windowMs
    this.cooldownMs = opts.cooldownMs
    this.backoffBaseMs = opts.backoffBaseMs ?? 2000
  }

  /** Drop attempts that have aged out of the sliding window (boundary inclusive). */
  private prune(now: number): void {
    const cutoff = now - this.windowMs
    this.attempts = this.attempts.filter((t) => t >= cutoff)
  }

  /** Record a reconnect attempt at the given time. */
  recordAttempt(now: number): void {
    this.attempts.push(now)
    this.prune(now)
  }

  /** Number of attempts currently inside the window. */
  attemptCount(now: number): number {
    this.prune(now)
    return this.attempts.length
  }

  /** True if attempts within the window have reached the configured limit. */
  shouldTrip(now: number): boolean {
    this.prune(now)
    return this.attempts.length >= this.maxAttempts
  }

  /** Begin a cooldown window starting at `now`. */
  startCooldown(now: number): void {
    this.cooldownStart = now
  }

  /** True while still inside the cooldown window. */
  isInCooldown(now: number): boolean {
    if (this.cooldownStart === null) return false
    if (now - this.cooldownStart >= this.cooldownMs) {
      // Cooldown elapsed — clear it so stale attempts also reset.
      this.cooldownStart = null
      return false
    }
    return true
  }

  /**
   * Exponential backoff delay for the *next* attempt, based on how many
   * attempts are already inside the window. With backoffBaseMs=2000:
   * 0 in-window -> 2000, 1 -> 4000, 2 -> 8000, ...
   */
  backoffDelay(now: number): number {
    const n = this.attemptCount(now)
    return this.backoffBaseMs * Math.pow(2, n)
  }

  /** Clear all state (e.g. after a successful connection). */
  reset(): void {
    this.attempts = []
    this.cooldownStart = null
  }
}
