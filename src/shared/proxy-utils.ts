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

/**
 * Return an array of warning messages for a normalized proxy target URL.
 * Callers can display these warnings in the UI without blocking the operation.
 *
 * Currently checks:
 * - Privileged port (1-1024): may accidentally expose system services.
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

  return warnings
}
