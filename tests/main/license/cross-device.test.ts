import { describe, it, expect, beforeAll, vi } from 'vitest'
import * as ed from '@noble/ed25519'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// Mock electron before importing verifier (same pattern as verifier.test.ts)
vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/tunnelbox-test' }
}))

import { verifyLicense, EMBEDDED_PUBLIC_KEY_HEX } from '../../../src/main/license/verifier'
import type { LicenseFile, LicensePayload } from '../../../src/shared/license-types'

/**
 * Story 106 (TIM-210): one purchased license is usable across the buyer's own
 * machines. This is a non-functional requirement — the app must NOT check an
 * activation count and must NOT phone home. These tests pin that behavior so a
 * future change can't silently introduce device-locking.
 */

let privateKey: Uint8Array

function base64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64')
}

function canonicalJson(payload: LicensePayload): Uint8Array {
  const sorted = Object.fromEntries(Object.entries(payload).sort(([a], [b]) => a.localeCompare(b)))
  return new TextEncoder().encode(JSON.stringify(sorted))
}

async function makeLicenseFile(payload: LicensePayload): Promise<LicenseFile> {
  const sig = await ed.signAsync(canonicalJson(payload), privateKey)
  return { payload, signature: base64(sig) }
}

function writeLicenseTo(dir: string, file: LicenseFile): string {
  fs.mkdirSync(dir, { recursive: true })
  const p = path.join(dir, 'license.dat')
  fs.writeFileSync(p, JSON.stringify(file), 'utf-8')
  return p
}

const payload: LicensePayload = {
  purchaser_email: 'user@example.com',
  purchase_date: '2026-05-28',
  license_id: '550e8400-e29b-41d4-a716-446655440000',
  expires_at: '2099-12-31',
  renewal_eligible_until: '2099-12-31',
  tier: 'pro',
  key_version: 'key_v1',
  founder_tier: 7
}

beforeAll(async () => {
  privateKey = ed.utils.randomSecretKey()
  EMBEDDED_PUBLIC_KEY_HEX['key_v1'] = Buffer.from(await ed.getPublicKeyAsync(privateKey)).toString('hex')
})

describe('Story 106 — cross-device license (no activation count, no phone-home)', () => {
  it('the same license file verifies identically across many independent machines', async () => {
    const file = await makeLicenseFile(payload)

    // Simulate distinct machines = distinct userData dirs each holding a copy.
    // The verifier takes no machine/device input, so every copy must verify the same.
    for (let machine = 0; machine < 3; machine++) {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), `tb-machine-${machine}-`))
      const result = await verifyLicense(writeLicenseTo(dir, file))
      expect(result.valid).toBe(true)
      if (result.valid) {
        expect(result.tier).toBe('pro')
        expect(result.purchaser_email).toBe('user@example.com')
        expect(result.founder_tier).toBe(7)
      }
    }
  })

  it('verification consumes no activation — repeated verifies succeed and never mutate state', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-activation-'))
    const licPath = writeLicenseTo(dir, await makeLicenseFile(payload))
    const fileBefore = fs.readFileSync(licPath, 'utf-8')
    const dirBefore = fs.readdirSync(dir).sort()

    for (let i = 0; i < 5; i++) {
      const result = await verifyLicense(licPath)
      expect(result.valid).toBe(true)
    }

    // No activation counter decremented, no sidecar state written, license untouched.
    expect(fs.readFileSync(licPath, 'utf-8')).toBe(fileBefore)
    expect(fs.readdirSync(dir).sort()).toEqual(dirBefore)
  })

  it('no phone-home: the verifier source contacts no network and binds no device identifier', () => {
    const src = fs.readFileSync(path.join(process.cwd(), 'src/main/license/verifier.ts'), 'utf-8')

    // No network egress (would be the only way to check an activation server).
    expect(src).not.toMatch(/node:(https?|net|dgram|tls)\b/)
    expect(src).not.toMatch(/\bfetch\s*\(/)
    expect(src).not.toMatch(/require\(\s*['"](https?|net|dgram|tls)['"]\s*\)/)

    // No machine binding / activation concepts.
    expect(src).not.toMatch(/hostname|networkInterfaces|machineId|getMac|activation/i)
  })
})
