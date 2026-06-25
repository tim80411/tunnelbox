/**
 * Validate a tunnel server address (frp/bore serverAddr) — a bare hostname or
 * IP literal that gets placed into a child-process argv (`bore ... --to
 * <serverAddr>:<port>`) or a config file. Rejecting whitespace, shell/TOML
 * metacharacters and control characters prevents the value from smuggling
 * extra arguments or breaking out of a quoted config value. (TIM-317, F27)
 */
export function isValidServerHost(host: string): boolean {
  if (typeof host !== 'string') return false
  const h = host.trim()
  if (h.length === 0 || h.length > 253) return false
  // Bracketed IPv6 literal, e.g. [2001:db8::1]
  if (/^\[[0-9a-fA-F:]+\]$/.test(h)) return true
  // Hostname or IPv4: alphanumerics, dots, hyphens; must start AND end with an
  // alphanumeric (so leading-dash flag injection and trailing junk are rejected).
  return /^[a-zA-Z0-9]([a-zA-Z0-9.-]*[a-zA-Z0-9])?$/.test(h)
}
