import { createLogger } from '../logger'

const log = createLogger('TunnelReadiness')

export interface ReadinessOptions {
  /** Polling interval in ms (default: 2000) */
  intervalMs?: number
  /** Total timeout in ms (default: 30000) */
  timeoutMs?: number
  /** AbortSignal to cancel the probe */
  signal?: AbortSignal
}

/**
 * Poll a tunnel URL until it returns any HTTP response.
 * Any status code (200, 502, 503, etc.) means DNS resolved and Cloudflare edge is reachable.
 * Only network-level failures (ENOTFOUND, ECONNREFUSED) cause retries.
 */
export async function waitForTunnelReady(
  url: string,
  options: ReadinessOptions = {}
): Promise<void> {
  const { intervalMs = 2000, timeoutMs = 30_000, signal } = options

  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    if (signal?.aborted) {
      throw new Error('Tunnel 驗證已取消')
    }

    try {
      const fetchSignal = signal
        ? AbortSignal.any([signal, AbortSignal.timeout(10_000)])
        : AbortSignal.timeout(10_000)

      await fetch(url, {
        method: 'HEAD',
        signal: fetchSignal,
        redirect: 'follow',
      })
      // Any HTTP response means the URL is reachable
      log.info(`Readiness probe passed for ${url}`)
      return
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      log.debug(`Readiness probe pending for ${url} (${reason}), retrying in ${intervalMs}ms`)
    }

    // Wait before next attempt, but bail early on abort
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, intervalMs)
      if (signal) {
        const onAbort = (): void => {
          clearTimeout(timer)
          resolve()
        }
        signal.addEventListener('abort', onAbort, { once: true })
      }
    })
  }

  throw new Error('Tunnel URL 驗證逾時，網址可能需要更長時間才能生效')
}
