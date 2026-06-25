import { describe, it, expect } from 'vitest'
import path from 'node:path'
import { resolveWithinRoot, isHostAllowed, isWsUpgradeAllowed, isSensitiveServePath } from '../../src/main/server-security'

describe('resolveWithinRoot (path traversal guard)', () => {
  const root = path.resolve('/srv/site')

  it('resolves a normal file within root', () => {
    expect(resolveWithinRoot('/srv/site', '/index.html')).toBe(path.join(root, 'index.html'))
  })

  it('resolves a nested file within root', () => {
    expect(resolveWithinRoot('/srv/site', '/sub/page.html')).toBe(path.join(root, 'sub', 'page.html'))
  })

  it('returns root itself for "/"', () => {
    expect(resolveWithinRoot('/srv/site', '/')).toBe(root)
  })

  it('strips query strings', () => {
    expect(resolveWithinRoot('/srv/site', '/index.html?v=1')).toBe(path.join(root, 'index.html'))
  })

  it('rejects ../ traversal escaping root', () => {
    expect(resolveWithinRoot('/srv/site', '/../../etc/passwd.html')).toBeNull()
  })

  it('rejects nested ../ that escapes after descending', () => {
    expect(resolveWithinRoot('/srv/site', '/sub/../../escape.html')).toBeNull()
  })

  it('rejects sibling-prefix escape (/srv/site-evil is NOT within /srv/site)', () => {
    expect(resolveWithinRoot('/srv/site', '/../site-evil/x.html')).toBeNull()
  })

  it('rejects a bare ../ at the path root', () => {
    expect(resolveWithinRoot('/srv/site', '/..')).toBeNull()
  })
})

describe('isHostAllowed (DNS rebinding guard)', () => {
  // lanEnabled: true mirrors a site with LAN sharing turned on — LAN IPs allowed.
  const local = { localIps: new Set<string>(['192.168.1.50', '10.0.0.7']), tunnelHosts: new Set<string>(), lanEnabled: true }
  // lanEnabled: false is the secure default (TIM-225) — LAN IPs rejected.
  const lanOff = { localIps: new Set<string>(['192.168.1.50', '10.0.0.7']), tunnelHosts: new Set<string>(), lanEnabled: false }

  it('allows localhost (with port)', () => {
    expect(isHostAllowed('localhost:3001', local)).toBe(true)
  })

  it('allows 127.0.0.1', () => {
    expect(isHostAllowed('127.0.0.1:3001', local)).toBe(true)
  })

  it('allows loopback range 127.x', () => {
    expect(isHostAllowed('127.0.0.53', local)).toBe(true)
  })

  it('allows bracketed IPv6 loopback', () => {
    expect(isHostAllowed('[::1]:3001', local)).toBe(true)
  })

  it('allows *.localhost', () => {
    expect(isHostAllowed('app.localhost', local)).toBe(true)
  })

  it('allows a detected LAN IP when lanEnabled is true', () => {
    expect(isHostAllowed('192.168.1.50:3001', local)).toBe(true)
  })

  it('rejects a detected LAN IP when lanEnabled is false (secure default)', () => {
    expect(isHostAllowed('192.168.1.50:3001', lanOff)).toBe(false)
    expect(isHostAllowed('10.0.0.7', lanOff)).toBe(false)
  })

  it('still allows localhost / loopback when lanEnabled is false', () => {
    // LAN gating must never break local access or tunnels (cloudflared dials 127.0.0.1).
    expect(isHostAllowed('localhost:3001', lanOff)).toBe(true)
    expect(isHostAllowed('127.0.0.1:3001', lanOff)).toBe(true)
    expect(isHostAllowed('[::1]:3001', lanOff)).toBe(true)
    expect(isHostAllowed('app.localhost', lanOff)).toBe(true)
  })

  it('still allows a registered tunnel host when lanEnabled is false', () => {
    const opts = { localIps: new Set<string>(), tunnelHosts: new Set<string>(['myapp.trycloudflare.com']), lanEnabled: false }
    expect(isHostAllowed('myapp.trycloudflare.com', opts)).toBe(true)
  })

  it('allows a registered tunnel host', () => {
    const opts = { localIps: new Set<string>(), tunnelHosts: new Set<string>(['myapp.trycloudflare.com']), lanEnabled: true }
    expect(isHostAllowed('myapp.trycloudflare.com', opts)).toBe(true)
  })

  it('rejects an arbitrary attacker host (DNS rebinding)', () => {
    expect(isHostAllowed('attacker.com', local)).toBe(false)
  })

  it('rejects an unregistered public host', () => {
    expect(isHostAllowed('evil.example.com:3001', local)).toBe(false)
  })

  it('allows a missing Host header (HTTP/1.0 / non-rebinding clients)', () => {
    expect(isHostAllowed(undefined, local)).toBe(true)
  })

  it('rejects a malformed bracketed host (unclosed bracket)', () => {
    expect(isHostAllowed('[', local)).toBe(false)
    expect(isHostAllowed('[evil.com', local)).toBe(false)
  })

  it('is case-insensitive on the hostname', () => {
    const opts = { localIps: new Set<string>(), tunnelHosts: new Set<string>(['MyApp.TryCloudflare.com'.toLowerCase()]), lanEnabled: true }
    expect(isHostAllowed('MYAPP.trycloudflare.COM', opts)).toBe(true)
  })
})

describe('isWsUpgradeAllowed (WebSocket DNS-rebinding / CSWSH guard — TIM-311)', () => {
  const lanOn = { localIps: new Set<string>(['192.168.1.50']), tunnelHosts: new Set<string>(), lanEnabled: true }
  const lanOff = { localIps: new Set<string>(['192.168.1.50']), tunnelHosts: new Set<string>(), lanEnabled: false }
  const tunnel = { localIps: new Set<string>(), tunnelHosts: new Set<string>(['myapp.trycloudflare.com']), lanEnabled: false }

  it('allows a same-origin loopback upgrade (Host allowed, Origin matches)', () => {
    expect(isWsUpgradeAllowed({ host: '127.0.0.1:3001', origin: 'http://127.0.0.1:3001' }, lanOn)).toBe(true)
  })

  it('allows a same-origin tunnel upgrade', () => {
    expect(
      isWsUpgradeAllowed({ host: 'myapp.trycloudflare.com', origin: 'https://myapp.trycloudflare.com' }, tunnel)
    ).toBe(true)
  })

  it('rejects an upgrade whose Host is not in the allowlist (DNS rebinding)', () => {
    // attacker.com rebinds to 127.0.0.1; the Host header still carries attacker.com.
    expect(isWsUpgradeAllowed({ host: 'attacker.com', origin: 'http://attacker.com' }, lanOn)).toBe(false)
  })

  it('rejects a cross-origin upgrade even when the Host is allowed (CSWSH)', () => {
    expect(isWsUpgradeAllowed({ host: '127.0.0.1:3001', origin: 'http://attacker.com' }, lanOn)).toBe(false)
  })

  it('allows a Host-allowed upgrade with no Origin (non-browser client)', () => {
    // Mirrors isHostAllowed: the Host gate still applies; absent Origin does not bypass it.
    expect(isWsUpgradeAllowed({ host: '127.0.0.1:3001' }, lanOn)).toBe(true)
  })

  it('still requires the Host gate when Origin is absent', () => {
    expect(isWsUpgradeAllowed({ host: 'attacker.com' }, lanOn)).toBe(false)
  })

  it('rejects a malformed / opaque Origin (e.g. "null") even when Host is allowed', () => {
    expect(isWsUpgradeAllowed({ host: '127.0.0.1:3001', origin: 'null' }, lanOn)).toBe(false)
  })

  it('mirrors the LAN gate: LAN-IP upgrade allowed only when lanEnabled is true', () => {
    const lanReq = { host: '192.168.1.50:3001', origin: 'http://192.168.1.50:3001' }
    expect(isWsUpgradeAllowed(lanReq, lanOn)).toBe(true)
    expect(isWsUpgradeAllowed(lanReq, lanOff)).toBe(false)
  })
})

describe('isSensitiveServePath (static-server dotfile blocklist — TIM-314 / F13)', () => {
  it('blocks credential / VCS dotfiles and dirs', () => {
    expect(isSensitiveServePath('/.env')).toBe(true)
    expect(isSensitiveServePath('/.env.local')).toBe(true)
    expect(isSensitiveServePath('/.env.production')).toBe(true)
    expect(isSensitiveServePath('/.git/config')).toBe(true)
    expect(isSensitiveServePath('/.git/HEAD')).toBe(true)
    expect(isSensitiveServePath('/.ssh/id_rsa')).toBe(true)
    expect(isSensitiveServePath('/.htpasswd')).toBe(true)
    expect(isSensitiveServePath('/sub/dir/.aws/credentials')).toBe(true)
  })

  it('blocks URL-encoded dotfile traversal', () => {
    expect(isSensitiveServePath('/%2egit/config')).toBe(true) // %2e → "."
    expect(isSensitiveServePath('/.git/config?x=1')).toBe(true) // query stripped
  })

  it('is case-insensitive on the segment', () => {
    expect(isSensitiveServePath('/.GIT/config')).toBe(true)
  })

  it('allows .well-known (ACME / domain verification) and normal assets', () => {
    expect(isSensitiveServePath('/.well-known/acme-challenge/token')).toBe(false)
    expect(isSensitiveServePath('/index.html')).toBe(false)
    expect(isSensitiveServePath('/assets/app.js')).toBe(false)
    expect(isSensitiveServePath('/')).toBe(false)
    expect(isSensitiveServePath('/environment.css')).toBe(false) // not a dotfile
  })
})
