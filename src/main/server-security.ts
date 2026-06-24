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
}

/**
 * DNS-rebinding guard for the static server. Decides whether a request's
 * `Host` header is one we expect to serve.
 *
 * Allowed: localhost / *.localhost, the loopback range (127.x, ::1), the
 * machine's own LAN IPs, and any tunnel hostname registered for this site.
 * Everything else (e.g. `attacker.com` rebinding 127.0.0.1) is rejected.
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
  if (opts.localIps.has(hostname)) return true
  if (opts.tunnelHosts.has(hostname)) return true
  return false
}

/** Default watch-ignore globs for dev folders (TIM-229). */
export const DEFAULT_WATCH_IGNORES: readonly string[] = [
  '**/node_modules/**',
  '**/.git/**',
  '**/dist/**',
  '**/build/**',
  '**/.DS_Store'
]
