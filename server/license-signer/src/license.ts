import * as ed from '@noble/ed25519'

/**
 * License payload + signing — the security-critical core.
 *
 * IMPORTANT: `canonicalJson` and the Ed25519 detached-signature scheme here MUST
 * stay byte-for-byte identical to the app-side verifier (src/main/license/verifier.ts):
 *   - sorted keys, no whitespace, UTF-8
 *   - @noble/ed25519 detached signature, base64-encoded
 * If these diverge, every license the signer mints will fail verification in the app.
 */

export interface LicensePayload {
  purchaser_email: string
  purchase_date: string // ISO date "YYYY-MM-DD"
  license_id: string // UUID
  expires_at: string // ISO date "YYYY-MM-DD"
  renewal_eligible_until: string // ISO date "YYYY-MM-DD"
  tier: 'pro'
  key_version: string // e.g. "key_v1"
  founder_tier: number | null // 1-100 for first 100 orders; null otherwise
}

export interface LicenseFile {
  payload: LicensePayload
  signature: string // base64-encoded Ed25519 detached signature
}

export interface LicenseInput {
  purchaserEmail: string
  /** Updates-included window in years (default 1). */
  renewalYears?: number
  /** Soft-lock anchor — app build dates after this re-show the renew banner. Default 1 year. */
  expiresYears?: number
  founderTier?: number | null
  keyVersion?: string
  /** Override for deterministic tests; defaults to a generated UUID. */
  licenseId?: string
  /** Override for deterministic tests; defaults to today (UTC). */
  purchaseDate?: string
}

/** Canonical JSON: sorted keys, no whitespace. MUST match verifier.ts canonicalJson(). */
export function canonicalJson(payload: LicensePayload): Uint8Array {
  const sorted = Object.fromEntries(Object.entries(payload).sort(([a], [b]) => a.localeCompare(b)))
  return new TextEncoder().encode(JSON.stringify(sorted))
}

export function buildLicensePayload(input: LicenseInput): LicensePayload {
  const purchaseDate = input.purchaseDate ?? new Date().toISOString().slice(0, 10)
  return {
    purchaser_email: input.purchaserEmail,
    purchase_date: purchaseDate,
    license_id: input.licenseId ?? crypto.randomUUID(),
    expires_at: addYears(purchaseDate, input.expiresYears ?? 1),
    renewal_eligible_until: addYears(purchaseDate, input.renewalYears ?? 1),
    tier: 'pro',
    key_version: input.keyVersion ?? 'key_v1',
    founder_tier: input.founderTier ?? null
  }
}

export async function signLicense(payload: LicensePayload, privateKeyHex: string): Promise<LicenseFile> {
  const privateKey = hexToBytes(privateKeyHex)
  const sig = await ed.signAsync(canonicalJson(payload), privateKey)
  return { payload, signature: base64FromBytes(sig) }
}

function addYears(isoDate: string, years: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`)
  d.setUTCFullYear(d.getUTCFullYear() + years)
  return d.toISOString().slice(0, 10)
}

function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error('invalid private key hex')
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return out
}

function base64FromBytes(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
}
