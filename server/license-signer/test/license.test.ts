import { describe, it, expect } from 'vitest'
import * as ed from '@noble/ed25519'
import { buildLicensePayload, canonicalJson, signLicense, type LicenseFile, type LicensePayload } from '../src/license'

/**
 * Mirror of the APP-side verification (src/main/license/verifier.ts) — independent
 * re-implementation so this test fails loudly if the signer's canonicalization or
 * signature format ever drifts from what the app will accept.
 */
function appCanonicalJson(payload: LicensePayload): Uint8Array {
  const sorted = Object.fromEntries(Object.entries(payload).sort(([a], [b]) => a.localeCompare(b)))
  return new TextEncoder().encode(JSON.stringify(sorted))
}
function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}
async function appVerify(file: LicenseFile, publicKey: Uint8Array): Promise<boolean> {
  return ed.verifyAsync(base64ToBytes(file.signature), appCanonicalJson(file.payload), publicKey)
}

async function freshKeypair(): Promise<{ privHex: string; pub: Uint8Array }> {
  const priv = ed.utils.randomSecretKey()
  const pub = await ed.getPublicKeyAsync(priv)
  let privHex = ''
  for (const b of priv) privHex += b.toString(16).padStart(2, '0')
  return { privHex, pub }
}

describe('canonicalJson', () => {
  it('sorts keys and emits no whitespace', () => {
    const payload = buildLicensePayload({
      purchaserEmail: 'a@b.com',
      licenseId: 'id-1',
      purchaseDate: '2026-01-01'
    })
    const text = new TextDecoder().decode(canonicalJson(payload))
    expect(text).not.toMatch(/\s/)
    const keys = Object.keys(JSON.parse(text))
    expect(keys).toEqual([...keys].sort((a, b) => a.localeCompare(b)))
  })
})

describe('signLicense ↔ app verifier', () => {
  it('produces a license the app verifier accepts', async () => {
    const { privHex, pub } = await freshKeypair()
    const payload = buildLicensePayload({ purchaserEmail: 'buyer@example.com', founderTier: 7 })
    const file = await signLicense(payload, privHex)

    expect(file.payload.tier).toBe('pro')
    expect(file.payload.founder_tier).toBe(7)
    expect(await appVerify(file, pub)).toBe(true)
  })

  it('rejects a tampered payload', async () => {
    const { privHex, pub } = await freshKeypair()
    const file = await signLicense(buildLicensePayload({ purchaserEmail: 'buyer@example.com' }), privHex)

    const tampered: LicenseFile = {
      ...file,
      payload: { ...file.payload, purchaser_email: 'attacker@evil.com' }
    }
    expect(await appVerify(tampered, pub)).toBe(false)
  })

  it('rejects verification under the wrong public key', async () => {
    const { privHex } = await freshKeypair()
    const { pub: otherPub } = await freshKeypair()
    const file = await signLicense(buildLicensePayload({ purchaserEmail: 'buyer@example.com' }), privHex)
    expect(await appVerify(file, otherPub)).toBe(false)
  })
})

describe('buildLicensePayload', () => {
  it('defaults to a regular Pro license (no founder badge)', () => {
    const p = buildLicensePayload({ purchaserEmail: 'x@y.com' })
    expect(p.founder_tier).toBeNull()
    expect(p.key_version).toBe('key_v1')
  })

  it('sets expires_at / renewal one year out by default', () => {
    const p = buildLicensePayload({ purchaserEmail: 'x@y.com', purchaseDate: '2026-06-09' })
    expect(p.expires_at).toBe('2027-06-09')
    expect(p.renewal_eligible_until).toBe('2027-06-09')
  })
})
