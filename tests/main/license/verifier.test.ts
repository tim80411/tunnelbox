import { describe, it, expect, beforeAll, vi } from 'vitest'
import * as ed from '@noble/ed25519'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// Mock electron before importing verifier
vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/tunnelbox-test' }
}))

import {
  verifyLicense,
  EMBEDDED_PUBLIC_KEY_HEX,
  isSoftLocked,
  BUILD_DATE
} from '../../../src/main/license/verifier'
import type { LicenseFile, LicensePayload } from '../../../src/shared/license-types'

// Test keypair — generated once for all tests in this file
let privateKey: Uint8Array
let publicKeyHex: string

function toHex(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('hex')
}

function base64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64')
}

function canonicalJson(payload: LicensePayload): Uint8Array {
  const sorted = Object.fromEntries(Object.entries(payload).sort(([a], [b]) => a.localeCompare(b)))
  return new TextEncoder().encode(JSON.stringify(sorted))
}

async function makeLicenseFile(
  payload: LicensePayload,
  key?: Uint8Array
): Promise<LicenseFile> {
  const sigKey = key ?? privateKey
  const message = canonicalJson(payload)
  const sig = await ed.signAsync(message, sigKey)
  return { payload, signature: base64(sig) }
}

function writeLicense(dir: string, file: LicenseFile): string {
  const p = path.join(dir, 'license.dat')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(p, JSON.stringify(file), 'utf-8')
  return p
}

const basePayload: LicensePayload = {
  purchaser_email: 'user@example.com',
  purchase_date: '2026-05-28',
  license_id: '550e8400-e29b-41d4-a716-446655440000',
  expires_at: '2027-05-28',
  renewal_eligible_until: '2028-05-28',
  tier: 'pro',
  key_version: 'key_v1',
  founder_tier: null
}

beforeAll(async () => {
  privateKey = ed.utils.randomSecretKey()
  const pubKey = await ed.getPublicKeyAsync(privateKey)
  publicKeyHex = toHex(pubKey)
  EMBEDDED_PUBLIC_KEY_HEX['key_v1'] = publicKeyHex
})

describe('verifyLicense — ES-111 acceptance scenarios', () => {
  it('scenario 2: no license file → no_license', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-lic-'))
    const result = await verifyLicense(path.join(tmpDir, 'license.dat'))
    expect(result).toEqual({ valid: false, reason: 'no_license' })
  })

  it('scenario 1: valid license with future expiry → valid, not soft_locked', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-lic-'))
    const licFile = await makeLicenseFile({ ...basePayload, expires_at: '2099-12-31' })
    const licPath = writeLicense(tmpDir, licFile)

    const result = await verifyLicense(licPath)
    expect(result.valid).toBe(true)
    if (result.valid) {
      expect(result.tier).toBe('pro')
      expect(result.purchaser_email).toBe('user@example.com')
      expect(result.soft_locked).toBe(false)
      expect(result.founder_tier).toBeNull()
    }
  })

  it('scenario 5: build_date > expires_at → soft_locked', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-lic-'))
    const licFile = await makeLicenseFile({ ...basePayload, expires_at: '2027-05-28' })
    const licPath = writeLicense(tmpDir, licFile)

    // Build date is injected (mirrors the build-time `define`), not read from env.
    const result = await verifyLicense(licPath, { buildDate: '2028-01-01' })
    expect(result.valid).toBe(true)
    if (result.valid) {
      expect(result.soft_locked).toBe(true)
    }
  })

  it('scenario 4: build_date <= expires_at → NOT soft_locked', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-lic-'))
    const licFile = await makeLicenseFile({ ...basePayload, expires_at: '2027-05-28' })
    const licPath = writeLicense(tmpDir, licFile)

    const result = await verifyLicense(licPath, { buildDate: '2027-01-01' })
    expect(result.valid).toBe(true)
    if (result.valid) {
      expect(result.soft_locked).toBe(false)
    }
  })

  it('scenario 3: tampered payload → invalid_signature', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-lic-'))
    const licFile = await makeLicenseFile(basePayload)
    // Tamper: change tier in payload but keep original signature
    const tampered: LicenseFile = {
      payload: { ...licFile.payload, tier: 'pro' as 'pro', expires_at: '2099-12-31' },
      signature: licFile.signature
    }
    const licPath = writeLicense(tmpDir, tampered)

    const result = await verifyLicense(licPath)
    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.reason).toBe('invalid_signature')
    }
  })

  it('scenario 3b: wrong private key → invalid_signature', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-lic-'))
    const wrongKey = ed.utils.randomSecretKey()
    const licFile = await makeLicenseFile(basePayload, wrongKey)
    const licPath = writeLicense(tmpDir, licFile)

    const result = await verifyLicense(licPath)
    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.reason).toBe('invalid_signature')
    }
  })

  it('scenario 6: corrupted JSON → license_corrupted', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-lic-'))
    const licPath = path.join(tmpDir, 'license.dat')
    fs.mkdirSync(tmpDir, { recursive: true })
    fs.writeFileSync(licPath, 'NOT-JSON{{{', 'utf-8')

    const result = await verifyLicense(licPath)
    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.reason).toBe('license_corrupted')
    }
  })

  it('ES-223 scenario 4: founder_tier is passed through verifier', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-lic-'))
    const licFile = await makeLicenseFile({ ...basePayload, founder_tier: 25 })
    const licPath = writeLicense(tmpDir, licFile)

    const result = await verifyLicense(licPath)
    expect(result.valid).toBe(true)
    if (result.valid) {
      expect(result.founder_tier).toBe(25)
    }
  })

  it('ES-223 scenario 5: missing founder_tier field treated as null', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-lic-'))
    const payloadWithoutFounder = { ...basePayload }
    // Simulate old license that has no founder_tier key at all
    const message = canonicalJson(payloadWithoutFounder)
    const sig = await ed.signAsync(message, privateKey)
    // We need to re-sign without the field for this test
    const oldStylePayload: Omit<LicensePayload, 'founder_tier'> & { founder_tier?: number | null } = {
      ...basePayload
    }
    delete oldStylePayload.founder_tier
    const msgOld = new TextEncoder().encode(
      JSON.stringify(Object.fromEntries(Object.entries(oldStylePayload).sort(([a], [b]) => a.localeCompare(b))))
    )
    const sigOld = await ed.signAsync(msgOld, privateKey)
    const licFile: LicenseFile = {
      payload: oldStylePayload as LicensePayload,
      signature: base64(sigOld)
    }
    const licPath = writeLicense(tmpDir, licFile)

    const result = await verifyLicense(licPath)
    expect(result.valid).toBe(true)
    if (result.valid) {
      expect(result.founder_tier).toBeNull()
    }
  })
})

describe('isSoftLocked — soft-lock boundary (Story 107 / TIM-211)', () => {
  it('build cut after the updates window lapsed → soft-locked', () => {
    expect(isSoftLocked('2027-05-28', '2028-01-01')).toBe(true)
  })

  it('build cut before the updates window lapsed → not soft-locked', () => {
    expect(isSoftLocked('2027-05-28', '2027-01-01')).toBe(false)
  })

  it('build cut exactly on the expiry date → not soft-locked (user keeps the build they own)', () => {
    expect(isSoftLocked('2027-05-28', '2027-05-28')).toBe(false)
  })

  it('defaults to the build-time BUILD_DATE when no override is given', () => {
    // BUILD_DATE falls back to today in dev/test (no vite `define`); a far-future
    // expiry must never be soft-locked against it.
    expect(isSoftLocked('2099-12-31')).toBe(false)
    // The fallback is a YYYY-MM-DD date string.
    expect(BUILD_DATE).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('verifyLicense — soft-lock ignores runtime env (the TIM-211 packaging bug)', () => {
  it('does NOT read process.env.TUNNELBOX_BUILD_DATE at runtime', async () => {
    // In a packaged app this env var is unset; honoring it would let the soft-lock
    // boundary drift to the user's clock. Setting it here must have no effect — the
    // boundary comes from the build-time constant (today, in test) instead.
    vi.stubEnv('TUNNELBOX_BUILD_DATE', '3000-01-01')
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-lic-'))
    const licFile = await makeLicenseFile({ ...basePayload, expires_at: '2099-12-31' })
    const licPath = writeLicense(tmpDir, licFile)

    const result = await verifyLicense(licPath)
    expect(result.valid).toBe(true)
    if (result.valid) {
      // Old buggy code read env (3000) and reported soft_locked = true.
      expect(result.soft_locked).toBe(false)
    }
    vi.unstubAllEnvs()
  })
})
