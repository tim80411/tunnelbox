import os from 'node:os'

export interface LanInterface {
  name: string
  ip: string
}

/**
 * VPN interface name patterns — these are deprioritized when selecting the
 * default LAN IP address.
 */
const VPN_PATTERNS = [/^utun/i, /^tun/i, /^ppp/i, /^ipsec/i, /^tap/i, /^wg/i]

/**
 * Returns true when the interface name looks like a VPN adapter.
 */
function isVpnInterface(name: string): boolean {
  return VPN_PATTERNS.some((p) => p.test(name))
}

/**
 * Preferred ordering: physical interfaces first (Wi-Fi / Ethernet), then
 * everything else. Lower return value = higher priority.
 */
function interfacePriority(name: string): number {
  const lower = name.toLowerCase()
  // macOS Wi-Fi
  if (lower.startsWith('en0')) return 0
  // macOS/Linux Ethernet
  if (lower.startsWith('en') || lower.startsWith('eth')) return 1
  // Linux Wi-Fi
  if (lower.startsWith('wlan') || lower.startsWith('wl')) return 2
  // Windows-style names (handled via en/eth above in most cases)
  if (lower.includes('wi-fi') || lower.includes('ethernet')) return 2
  // VPN — lowest priority
  if (isVpnInterface(name)) return 100
  // Everything else
  return 50
}

/**
 * Get all non-internal IPv4 addresses that look like LAN addresses,
 * sorted by interface priority (Wi-Fi/Ethernet first, VPN last).
 *
 * Filters out:
 * - Internal / loopback interfaces
 * - Link-local addresses (169.254.x.x)
 * - IPv6 addresses
 */
export function getAllLanIps(): LanInterface[] {
  const interfaces = os.networkInterfaces()
  const results: LanInterface[] = []

  for (const [name, addrs] of Object.entries(interfaces)) {
    if (!addrs) continue
    for (const addr of addrs) {
      // Only IPv4, non-internal
      if (addr.family !== 'IPv4' || addr.internal) continue
      // Skip link-local (169.254.x.x)
      if (addr.address.startsWith('169.254.')) continue
      results.push({ name, ip: addr.address })
    }
  }

  // Sort by interface priority so the "best" address comes first
  results.sort((a, b) => interfacePriority(a.name) - interfacePriority(b.name))

  return results
}

/**
 * Get the single best-guess LAN IP address. Returns `null` when no
 * suitable LAN interface is detected (e.g. no network connection).
 */
export function getLanIp(): string | null {
  const all = getAllLanIps()
  return all.length > 0 ? all[0].ip : null
}
