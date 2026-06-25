export const PORT_MIN = 1
export const PORT_MAX = 65535
export const PRIVILEGED_PORT_THRESHOLD = 1024

/**
 * Check whether a port number falls in the privileged range (1-1024).
 * Privileged ports are typically reserved for system services (e.g. SSH on 22,
 * HTTP on 80, HTTPS on 443) and exposing them through a tunnel may
 * accidentally reveal sensitive services.
 */
export function isPrivilegedPort(port: number): boolean {
  return port >= PORT_MIN && port <= PRIVILEGED_PORT_THRESHOLD
}

/**
 * Normalize a proxy target input string.
 *
 * - "3000"  → "http://localhost:3000"
 * - ":3000" → "http://localhost:3000"
 * - "http://localhost:3000" → "http://localhost:3000" (unchanged)
 *
 * Throws RangeError if input is a port number outside 1-65535.
 * Non-numeric strings are returned as-is — callers must validate with `isValidProxyTarget`.
 */
export function normalizeProxyTarget(input: string): string {
  const trimmed = input.trim()

  const match = trimmed.match(/^:?(\d+)$/)
  if (match) {
    const port = Number(match[1])
    if (port < PORT_MIN || port > PORT_MAX) {
      throw new RangeError(`Port 必須在 ${PORT_MIN}-${PORT_MAX} 之間`)
    }
    return `http://localhost:${port}`
  }

  return trimmed
}

/**
 * Validate that a proxy target URL is a well-formed http or https URL.
 * Must be called after `normalizeProxyTarget`.
 */
export function isValidProxyTarget(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * Extract the port number from a proxy target URL.
 * Falls back to 443 for https or 80 for http when no explicit port is set.
 */
export function extractPort(url: string): number {
  const parsed = new URL(url)
  if (parsed.port) return Number(parsed.port)
  return parsed.protocol === 'https:' ? 443 : 80
}

/** Network class of a proxy-target host, for SSRF risk assessment (TIM-312). */
export type ProxyHostClass = 'loopback' | 'link-local' | 'private' | 'public'

/**
 * Classify a proxy-target hostname into a network class for SSRF assessment.
 *
 * `loopback` is the PRIMARY, expected use case ("share my local dev server"),
 * so it carries no risk. `link-local` covers the cloud instance-metadata range
 * 169.254.0.0/16 (e.g. 169.254.169.254) and IPv6 fe80::/10 — proxying these
 * through a public tunnel can leak instance credentials and has no legitimate
 * use. `private` covers RFC1918 / IPv6 ULA — possibly a deliberate LAN proxy,
 * possibly an accidental internal exposure, so it warrants a warning. (TIM-312)
 */
export function classifyProxyHost(hostname: string): ProxyHostClass {
  let h = hostname.trim().toLowerCase()
  if (h.startsWith('[') && h.endsWith(']')) h = h.slice(1, -1) // strip IPv6 brackets

  // Loopback / wildcard (the normal local-dev case).
  if (h === 'localhost' || h.endsWith('.localhost')) return 'loopback'
  if (h === '::1' || h === '0.0.0.0') return 'loopback'
  if (/^127\./.test(h)) return 'loopback'

  // Link-local & cloud instance metadata — no legitimate proxy use.
  if (/^169\.254\./.test(h)) return 'link-local'
  if (h.startsWith('fe80:')) return 'link-local'
  if (h === 'metadata.google.internal' || h === 'metadata') return 'link-local'

  // RFC1918 private + IPv6 ULA (fc00::/7).
  if (/^10\./.test(h)) return 'private'
  if (/^192\.168\./.test(h)) return 'private'
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return 'private'
  if (/^f[cd][0-9a-f]{2}:/.test(h)) return 'private'

  return 'public'
}

/**
 * Return an array of warning messages for a normalized proxy target URL.
 * Callers can display these warnings in the UI without blocking the operation.
 *
 * Checks:
 * - Privileged port (1-1024): may accidentally expose system services.
 * - SSRF (TIM-312): link-local / cloud-metadata and RFC1918 private targets,
 *   which become internet-reachable once the proxy is shared through a tunnel.
 */
export function getProxyTargetWarnings(target: string): string[] {
  const warnings: string[] = []

  try {
    const port = extractPort(target)
    if (isPrivilegedPort(port)) {
      warnings.push(
        `Port ${port} 是特權埠 (1-${PRIVILEGED_PORT_THRESHOLD})，可能會意外暴露系統服務（如 SSH、資料庫）。請確認這是您要代理的服務。`
      )
    }
  } catch {
    // target is not a valid URL — skip port-level warnings
  }

  try {
    const hostname = new URL(target).hostname
    const cls = classifyProxyHost(hostname)
    if (cls === 'link-local') {
      warnings.push(
        `目標位址 ${hostname} 屬 link-local / 雲端 metadata 範圍（如 169.254.169.254）。透過 tunnel 對外分享等於把雲端主機的 metadata／憑證端點公開給任何人，極可能導致憑證外洩 (SSRF)。請勿代理此類位址。`
      )
    } else if (cls === 'private') {
      warnings.push(
        `目標位址 ${hostname} 屬內網位址 (RFC1918)。透過 tunnel 對外分享會把這個內網服務公開到網際網路，請確認你了解此風險 (SSRF)。`
      )
    }
  } catch {
    // target is not a valid URL — skip host-level warnings
  }

  return warnings
}
