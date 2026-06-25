import path from 'node:path'

/**
 * Resolve a URL path against a root directory, guaranteeing the result stays
 * inside `root`. Returns the absolute filesystem path, or `null` if the URL
 * path attempts to escape `root` (a path-traversal attempt).
 *
 * The static server's custom `.html` fast-path (server-manager) does its own
 * `path.join(folderPath, decodedUrl)` which bypasses serve-handler's built-in
 * traversal protection — this helper closes that hole. (TIM-225)
 */
export function resolveWithinRoot(root: string, urlPath: string): string | null {
  const resolvedRoot = path.resolve(root)

  // Drop any query string, then treat the URL path as relative to root.
  const decoded = urlPath.split('?')[0]
  // Strip only leading separators (so the path is relative) — deliberately do
  // NOT strip "../" segments. We let path.resolve compute the real target and
  // then reject anything that escaped, rather than silently clamping a
  // traversal attempt to some other in-root file.
  const rel = decoded.replace(/^[/\\]+/, '')
  const target = path.resolve(resolvedRoot, rel)

  // Containment check. The trailing-separator comparison prevents a sibling
  // directory whose name merely shares the root as a prefix (e.g. "/srv/site"
  // vs "/srv/site-evil") from being treated as inside the root.
  if (target === resolvedRoot || target.startsWith(resolvedRoot + path.sep)) {
    return target
  }
  return null
}

export interface HostAllowOptions {
  /** The machine's own IP addresses (loopback + LAN), lowercased. */
  localIps: Set<string>
  /** Public hostnames currently bound to this site via a tunnel, lowercased. */
  tunnelHosts: Set<string>
  /**
   * Whether this site has LAN sharing enabled (TIM-225). When false (the
   * secure default), the machine's LAN IPs are NOT accepted as a Host — only
   * loopback / *.localhost / registered tunnel hosts are. When true, LAN IPs
   * are also accepted so same-network devices can reach the site.
   */
  lanEnabled: boolean
}

/**
 * DNS-rebinding guard for the static server. Decides whether a request's
 * `Host` header is one we expect to serve.
 *
 * Allowed: localhost / *.localhost, the loopback range (127.x, ::1), and any
 * tunnel hostname registered for this site. The machine's own LAN IPs are
 * accepted only when `opts.lanEnabled` is true (per-site LAN sharing on);
 * with the secure default off, a LAN-IP Host is rejected. Everything else
 * (e.g. `attacker.com` rebinding 127.0.0.1) is always rejected.
 *
 * This is robust regardless of whether cloudflared forwards the original
 * public Host or rewrites it to localhost: the localhost case hits the
 * loopback allow-list, and the preserved-public-host case hits the registered
 * tunnel host. (TIM-225)
 */
export function isHostAllowed(hostHeader: string | undefined, opts: HostAllowOptions): boolean {
  // HTTP/1.0 and some tooling omit Host entirely; that is not the rebinding
  // vector (rebinding always carries a forged Host), so don't break them.
  if (!hostHeader) return true

  let hostname = hostHeader.trim().toLowerCase()
  if (!hostname) return true

  if (hostname.startsWith('[')) {
    // Bracketed IPv6: "[::1]" or "[::1]:3000"
    const end = hostname.indexOf(']')
    if (end <= 0) return false // malformed bracketed host — reject rather than fall through to allow
    hostname = hostname.slice(1, end)
  } else {
    // Strip a trailing ":port"
    hostname = hostname.replace(/:\d+$/, '')
  }

  if (hostname === 'localhost' || hostname.endsWith('.localhost')) return true
  if (hostname === '::1' || hostname === '0.0.0.0') return true
  if (hostname.startsWith('127.')) return true
  // LAN IPs only when this site opted into LAN sharing (TIM-225 secure default).
  if (opts.lanEnabled && opts.localIps.has(hostname)) return true
  if (opts.tunnelHosts.has(hostname)) return true
  return false
}

/**
 * DNS-rebinding / cross-site-WebSocket-hijacking (CSWSH) guard for the WS
 * upgrade path. The HTTP handler already runs `isHostAllowed`, but the
 * `upgrade` handler shared the same port with no guard — a forged-Host or
 * cross-origin `new WebSocket()` could connect where an HTTP GET is 403'd. (TIM-311)
 *
 * Decision:
 * - The `Host` header must pass `isHostAllowed` (same trust boundary as HTTP).
 * - When an `Origin` is present (browsers always send one for WS), its host
 *   must ALSO pass `isHostAllowed`, so a cross-origin attacker page is rejected
 *   even if it targets an allowed Host. A malformed/opaque Origin (e.g. "null")
 *   is rejected. An absent Origin (non-browser clients) does not bypass the
 *   Host gate — consistent with `isHostAllowed`'s missing-Host behaviour.
 */
export function isWsUpgradeAllowed(
  headers: { host?: string; origin?: string },
  opts: HostAllowOptions
): boolean {
  if (!isHostAllowed(headers.host, opts)) return false

  const origin = headers.origin
  if (origin) {
    let originHost: string
    try {
      // URL.host keeps any ":port"; isHostAllowed strips it before matching.
      originHost = new URL(origin).host
    } catch {
      return false // malformed / opaque Origin (e.g. "null") — reject
    }
    if (!isHostAllowed(originHost, opts)) return false
  }

  return true
}

/** Default watch-ignore globs for dev folders (TIM-229). */
export const DEFAULT_WATCH_IGNORES: readonly string[] = [
  '**/node_modules/**',
  '**/.git/**',
  '**/dist/**',
  '**/build/**',
  '**/.DS_Store'
]
