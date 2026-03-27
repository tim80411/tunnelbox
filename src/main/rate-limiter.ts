import { createLogger } from './logger'

const log = createLogger('RateLimiter')

// ---------- Sliding-window rate limiter (per-key) ----------

interface RateLimitEntry {
  count: number
  resetTime: number
}

/** In-memory sliding-window rate limiter keyed by an arbitrary string (e.g. IP). */
const rateLimits = new Map<string, RateLimitEntry>()

/**
 * Check whether a request identified by `key` is within the allowed rate.
 * Returns `true` if the request is allowed, `false` if it should be rejected.
 *
 * @param key      Unique identifier (e.g. IP address or "ip:route")
 * @param limit    Maximum number of requests allowed in the window
 * @param windowMs Window duration in milliseconds
 */
export function checkRateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now()
  const entry = rateLimits.get(key)

  if (!entry || now > entry.resetTime) {
    rateLimits.set(key, { count: 1, resetTime: now + windowMs })
    return true
  }

  if (entry.count >= limit) {
    return false
  }

  entry.count++
  return true
}

// ---------- Concurrent-connection counter (per-key) ----------

const connectionCounts = new Map<string, number>()

/**
 * Try to acquire a connection slot for the given key.
 * Returns `true` if the connection is accepted, `false` if the limit is reached.
 */
export function acquireConnection(key: string, limit: number): boolean {
  const current = connectionCounts.get(key) || 0
  if (current >= limit) {
    return false
  }
  connectionCounts.set(key, current + 1)
  return true
}

/**
 * Release a previously acquired connection slot.
 */
export function releaseConnection(key: string): void {
  const current = connectionCounts.get(key) || 0
  if (current <= 1) {
    connectionCounts.delete(key)
  } else {
    connectionCounts.set(key, current - 1)
  }
}

/**
 * Get the current connection count for a key.
 */
export function getConnectionCount(key: string): number {
  return connectionCounts.get(key) || 0
}

// ---------- Global counter ----------

let globalConnectionCount = 0

/**
 * Try to acquire a slot against the global connection limit.
 * Returns `true` if accepted, `false` if the global limit is reached.
 */
export function acquireGlobalConnection(limit: number): boolean {
  if (globalConnectionCount >= limit) {
    return false
  }
  globalConnectionCount++
  return true
}

/**
 * Release a slot from the global connection counter.
 */
export function releaseGlobalConnection(): void {
  if (globalConnectionCount > 0) {
    globalConnectionCount--
  }
}

export function getGlobalConnectionCount(): number {
  return globalConnectionCount
}

// ---------- Periodic cleanup ----------

let cleanupInterval: ReturnType<typeof setInterval> | null = null

/**
 * Start periodic cleanup of stale rate-limit entries.
 * Safe to call multiple times; only one interval will be active.
 */
export function startCleanup(intervalMs: number = 5 * 60 * 1000): void {
  if (cleanupInterval) return

  cleanupInterval = setInterval(() => {
    const now = Date.now()
    let removed = 0
    for (const [key, entry] of rateLimits) {
      if (now > entry.resetTime) {
        rateLimits.delete(key)
        removed++
      }
    }
    if (removed > 0) {
      log.info(`Rate-limit cleanup: removed ${removed} stale entries`)
    }
  }, intervalMs)

  // Allow the process to exit even if the interval is still active
  if (cleanupInterval.unref) {
    cleanupInterval.unref()
  }
}

/**
 * Stop the periodic cleanup (for graceful shutdown).
 */
export function stopCleanup(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval)
    cleanupInterval = null
  }
}
