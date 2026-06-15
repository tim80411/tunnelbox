import fs from 'node:fs'
import path from 'node:path'
import * as ed from '@noble/ed25519'
import type { LicenseFile, LicensePayload, VerifyResult } from '../../shared/license-types'
import { createLogger } from '../logger'

const log = createLogger('LicenseVerifier')

// Build date baked into the bundle at BUILD time. electron-vite's `define`
// (see electron.vite.config.ts) statically replaces `__TUNNELBOX_BUILD_DATE__`
// with a 'YYYY-MM-DD' string literal when the release is compiled, so every
// shipped build has a FIXED soft-lock boundary.
//
// We deliberately do NOT read process.env here: in a packaged Electron app that
// variable is unset, so the soft-lock check would silently drift to the user's
// clock and could lock a build the user already owns once today passes their
// expires_at (Story 107 / TIM-211).
//
// In dev/test the `define` is absent, so `__TUNNELBOX_BUILD_DATE__` is an
// undeclared global. `typeof` is the one reference form that is safe on an
// undeclared identifier (it yields 'undefined' instead of throwing), so the
// short-circuit below never dereferences a missing global; we then fall back to
// today's date.
declare const __TUNNELBOX_BUILD_DATE__: string | undefined

export const BUILD_DATE: string =
  (typeof __TUNNELBOX_BUILD_DATE__ !== 'undefined' && __TUNNELBOX_BUILD_DATE__) ||
  new Date().toISOString().slice(0, 10)

/**
 * Soft-lock rule (Story 107 / TIM-211): a Pro license keeps the build the user
 * already owns usable indefinitely; only builds cut AFTER the updates window
 * lapsed require renewal. So a build is soft-locked iff it was produced strictly
 * after the window ended, i.e. `expires_at < buildDate`. Equal dates are NOT
 * soft-locked — the user keeps the build cut on their last covered day.
 *
 * `buildDate` defaults to the build-time {@link BUILD_DATE}; it is injectable so
 * the boundary can be exercised deterministically in tests.
 */
export function isSoftLocked(expiresAt: string, buildDate: string = BUILD_DATE): boolean {
  return new Date(expiresAt) < new Date(buildDate)
}

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

export async function verifyLicense(
  licensePath?: string,
  opts?: { buildDate?: string }
): Promise<VerifyResult> {
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

  // Soft-lock check: a newer build (cut after the updates window lapsed) needs a
  // renewal, but the build the user already owns stays usable. The boundary is the
  // build date baked in at build time — never the runtime clock. See isSoftLocked.
  const softLocked = isSoftLocked(payload.expires_at, opts?.buildDate)

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
