import { createLogger } from '../logger'

const log = createLogger('TunnelReadiness')

/** Cloudflare DoH endpoint — same path as Chrome's DNS resolution */
const DOH_URL = 'https://cloudflare-dns.com/dns-query'

/** Fraction of total timeout allocated to Phase 1 (DoH DNS check). */
const DNS_PHASE_RATIO = 2 / 3

/** Sleep that bails early on abort, with proper listener cleanup. */
function sleepWithAbort(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = (): void => {
      clearTimeout(timer)
      resolve()
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

export interface ReadinessOptions {
  /** Polling interval in ms (default: 2000) */
  intervalMs?: number
  /** Total timeout in ms (default: 90000) */
  timeoutMs?: number
  /** AbortSignal to cancel the probe */
  signal?: AbortSignal
}

/**
 * Check if a hostname resolves via DNS-over-HTTPS (Cloudflare DoH).
 * This uses the same resolution path as Chrome/Firefox, bypassing the
 * OS resolver entirely — no NXDOMAIN is cached in mDNSResponder or
 * Tailscale MagicDNS.
 */
async function checkDnsViaDoH(hostname: string, signal?: AbortSignal): Promise<boolean> {
  try {
    const fetchSignal = signal
      ? AbortSignal.any([signal, AbortSignal.timeout(5_000)])
      : AbortSignal.timeout(5_000)

    const res = await fetch(`${DOH_URL}?name=${hostname}&type=A`, {
      headers: { accept: 'application/dns-json' },
      signal: fetchSignal,
    })
    if (!res.ok) return false

    const data = (await res.json()) as { Status: number; Answer?: unknown[] }
    // Status 0 = NOERROR, and at least one answer record means the name resolves
    return data.Status === 0 && Array.isArray(data.Answer) && data.Answer.length > 0
  } catch {
    return false
  }
}

/**
 * Wait until the tunnel hostname resolves via DoH.
 * This avoids polluting the OS DNS cache with NXDOMAIN responses
 * (which would be cached for 30 minutes per the SOA MINIMUM TTL of trycloudflare.com).
 */
async function waitForDnsPropagation(
  hostname: string,
  options: { intervalMs: number; deadline: number; signal?: AbortSignal }
): Promise<boolean> {
  const { intervalMs, deadline, signal } = options

  while (Date.now() < deadline) {
    if (signal?.aborted) {
      throw new Error('Tunnel 驗證已取消')
    }

    const resolved = await checkDnsViaDoH(hostname, signal)
    if (resolved) {
      log.info(`DNS record confirmed for ${hostname} via DoH`)
      return true
    }

    log.info(`DNS not yet propagated for ${hostname} via DoH, retrying in ${intervalMs}ms`)

    await sleepWithAbort(intervalMs, signal)
  }

  log.info(`DNS propagation check timed out for ${hostname}, falling through to fetch probe`)
  return false
}

/**
 * Poll a tunnel URL until it returns any HTTP response.
 *
 * Phase 1 — DoH DNS check: Query Cloudflare's DNS-over-HTTPS endpoint
 *   (same path as the browser) to confirm the record exists without
 *   polluting the OS DNS cache. Up to 2/3 of the total timeout.
 *
 * Phase 2 — fetch probe: HEAD request to confirm end-to-end reachability.
 *   Gets the remaining 1/3 of the timeout.
 *
 * Any HTTP status (200, 502, 503, etc.) in Phase 2 means success.
 */
export async function waitForTunnelReady(
  url: string,
  options: ReadinessOptions = {}
): Promise<void> {
  const { intervalMs = 2000, timeoutMs = 90_000, signal } = options

  const now = Date.now()
  const hostname = new URL(url).hostname

  // Phase 1: DoH DNS check (no OS cache pollution)
  const dnsDeadline = now + Math.floor(timeoutMs * DNS_PHASE_RATIO)
  await waitForDnsPropagation(hostname, { intervalMs, deadline: dnsDeadline, signal })

  // Phase 2: fetch probe (gets remaining time)
  const fetchDeadline = now + timeoutMs

  while (Date.now() < fetchDeadline) {
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
      log.info(`Readiness probe passed for ${url}`)
      return
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      log.info(`Readiness probe pending for ${url} (${reason}), retrying in ${intervalMs}ms`)
    }

    await sleepWithAbort(intervalMs, signal)
  }

  throw new Error('Tunnel URL 驗證逾時，網址可能需要更長時間才能生效')
}
