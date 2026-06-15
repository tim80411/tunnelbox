import fs from 'node:fs'
import path from 'node:path'
import * as ed from '@noble/ed25519'
import type { LicenseFile, LicensePayload, VerifyResult } from '../../shared/license-types'
import { createLogger } from '../logger'

const log = createLogger('LicenseVerifier')

// Public key embedded in the app binary (key_v1).
// A public verification key is NOT a secret, so it is hardcoded here — this is the
// only path that survives bundling into a packaged app (a runtime process.env read
// would be empty on the user's machine). The matching PRIVATE key lives only on the
// signer side (OCI bucket `tunnelbox-secrets` → Cloudflare Workers secret
// ED25519_PRIVATE_KEY) and is never shipped with the app.
// The env override exists so tests/dev can inject a throwaway key.
// To rotate: add 'key_v2' here and branch on payload.key_version.
export const EMBEDDED_PUBLIC_KEY_HEX: Record<string, string> = {
  key_v1:
    process.env['TUNNELBOX_LICENSE_PUBKEY_V1'] ??
    'd97d6edc0bcacdba462dcc73d2c734ab82cdea62eaf1db1de75224fe3d09e0c0'
}

export function getLicensePath(): string {
  // Lazily import electron's app so this module can be unit-tested without Electron
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { app } = require('electron') as typeof import('electron')
    return path.join(app.getPath('userData'), 'license.dat')
  } catch {
    // Fallback for non-Electron environments (tests, CLI)
    const homeDir = process.env['HOME'] ?? process.env['USERPROFILE'] ?? ''
    if (process.platform === 'win32') {
      return path.join(process.env['APPDATA'] ?? homeDir, 'tunnelbox', 'license.dat')
    }
    return path.join(homeDir, '.config', 'tunnelbox', 'license.dat')
  }
}

// Canonical JSON serialization: sorted keys, no extra whitespace
function canonicalJson(payload: LicensePayload): Uint8Array {
  const sorted = Object.fromEntries(Object.entries(payload).sort(([a], [b]) => a.localeCompare(b)))
  return new TextEncoder().encode(JSON.stringify(sorted))
}

function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error('invalid hex')
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return out
}

function base64ToBytes(b64: string): Uint8Array {
  return Uint8Array.from(Buffer.from(b64, 'base64'))
}

export async function verifyLicense(licensePath?: string): Promise<VerifyResult> {
  const filePath = licensePath ?? getLicensePath()

  if (!fs.existsSync(filePath)) {
    return { valid: false, reason: 'no_license' }
  }

  let licenseFile: LicenseFile
  try {
    const raw = fs.readFileSync(filePath, 'utf-8')
    licenseFile = JSON.parse(raw) as LicenseFile
    if (!licenseFile.payload || !licenseFile.signature) {
      return { valid: false, reason: 'license_corrupted' }
    }
  } catch {
    return { valid: false, reason: 'license_corrupted' }
  }

  const { payload, signature } = licenseFile

  // Validate required fields
  if (
    !payload.purchaser_email ||
    !payload.license_id ||
    !payload.expires_at ||
    !payload.tier ||
    !payload.key_version
  ) {
    return { valid: false, reason: 'license_corrupted' }
  }

  const pubKeyHex = EMBEDDED_PUBLIC_KEY_HEX[payload.key_version]
  if (!pubKeyHex) {
    log.warn(`Unknown key_version: ${payload.key_version}`)
    return { valid: false, reason: 'invalid_signature' }
  }

  try {
    const message = canonicalJson(payload)
    const sigBytes = base64ToBytes(signature)
    const pubKeyBytes = hexToBytes(pubKeyHex)
    const valid = await ed.verifyAsync(sigBytes, message, pubKeyBytes)
    if (!valid) {
      log.warn('License signature verification failed')
      return { valid: false, reason: 'invalid_signature' }
    }
  } catch (err) {
    log.warn('License signature error:', err)
    return { valid: false, reason: 'invalid_signature' }
  }

  // Soft-lock check: expires_at < app build date means user needs to renew for newer builds
  // Build date is embedded at build time; fall back to today if not set
  const buildDateStr =
    process.env['TUNNELBOX_BUILD_DATE'] ?? new Date().toISOString().slice(0, 10)
  const expiresAt = new Date(payload.expires_at)
  const buildDate = new Date(buildDateStr)
  const softLocked = expiresAt < buildDate

  const founderTier =
    typeof payload.founder_tier === 'number' ? payload.founder_tier : null

  return {
    valid: true,
    tier: 'pro',
    purchaser_email: payload.purchaser_email,
    expires_at: payload.expires_at,
    soft_locked: softLocked,
    founder_tier: founderTier
  }
}
