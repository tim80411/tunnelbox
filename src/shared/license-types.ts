// License payload schema (ES-109 + ES-223 founder_tier extension)
// Private key lives on the signer side only (out-of-scope for app).
// App only needs the embedded public key to verify signatures offline.

export interface LicensePayload {
  purchaser_email: string
  purchase_date: string       // ISO date "YYYY-MM-DD"
  license_id: string          // UUID
  expires_at: string          // ISO date "YYYY-MM-DD"
  renewal_eligible_until: string // ISO date "YYYY-MM-DD"
  tier: 'pro'
  key_version: string         // e.g. "key_v1" — reserved for future key rotation
  founder_tier: number | null // 1-100 for first 100 orders; null otherwise (ES-223)
}

export interface LicenseFile {
  payload: LicensePayload
  signature: string           // base64-encoded Ed25519 detached signature
}

export type VerifyResult =
  | {
      valid: true
      tier: 'pro'
      purchaser_email: string
      expires_at: string
      soft_locked: boolean
      founder_tier: number | null
    }
  | { valid: false; reason: 'no_license' | 'invalid_signature' | 'license_corrupted' }

export type TierState = {
  isPro: boolean
  tier: 'free' | 'pro'
  softLocked: boolean
  founderTier: number | null
}

// Result of importing a license file (Story 105 / TIM-209)
export type ImportResult =
  | { ok: true; email: string; founderTier: number | null }
  | { ok: false; error: string }
