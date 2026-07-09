import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import * as ed from '@noble/ed25519'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// Mock electron so getLicensePath() resolves to a temp userData dir.
vi.mock('electron', () => ({
  app: { getPath: () => path.join(os.tmpdir(), 'tb-import-test-userdata') }
}))

import { importLicenseFromFile, findDownloadedLicense } from '../../../src/main/license/import'
import { getLicensePath, EMBEDDED_PUBLIC_KEY_HEX } from '../../../src/main/license/verifier'
import { tierGate } from '../../../src/main/license/tier-gate'
import type { LicenseFile, LicensePayload } from '../../../src/shared/license-types'

let privateKey: Uint8Array

function base64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64')
}
function canonicalJson(payload: LicensePayload): Uint8Array {
  const sorted = Object.fromEntries(Object.entries(payload).sort(([a], [b]) => a.localeCompare(b)))
  return new TextEncoder().encode(JSON.stringify(sorted))
}
async function makeLicenseFile(payload: LicensePayload, key?: Uint8Array): Promise<LicenseFile> {
  const sig = await ed.signAsync(canonicalJson(payload), key ?? privateKey)
  return { payload, signature: base64(sig) }
}
function writeTmp(file: LicenseFile): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-src-'))
  const p = path.join(dir, 'license.json')
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
  founder_tier: 42
}

beforeAll(async () => {
  privateKey = ed.utils.randomSecretKey()
  EMBEDDED_PUBLIC_KEY_HEX['key_v1'] = Buffer.from(await ed.getPublicKeyAsync(privateKey)).toString('hex')
})

beforeEach(() => {
  // Clean the active license + reset tier gate to Free before each case.
  try {
    fs.rmSync(getLicensePath(), { force: true })
  } catch {
    /* ignore */
  }
  tierGate._setState({ isPro: false, tier: 'free', softLocked: false, founderTier: null })
})

describe('importLicenseFromFile (US-105)', () => {
  it('scenario 1/2: a valid license is installed and activates Pro immediately', async () => {
    const src = writeTmp(await makeLicenseFile(payload))
    const res = await importLicenseFromFile(src)

    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.email).toBe('user@example.com')
      expect(res.founderTier).toBe(42)
    }
    expect(fs.existsSync(getLicensePath())).toBe(true)
    // tierGate.refresh() ran → Pro is live without restart
    expect(tierGate.isPro()).toBe(true)
    expect(tierGate.getFounderTier()).toBe(42)
  })

  it('scenario 3: a forged license returns an error and is NOT written', async () => {
    const wrongKey = ed.utils.randomSecretKey()
    const src = writeTmp(await makeLicenseFile(payload, wrongKey))
    const res = await importLicenseFromFile(src)

    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toMatch(/簽章/)
    expect(fs.existsSync(getLicensePath())).toBe(false)
    expect(tierGate.isPro()).toBe(false)
  })

  it('scenario 3: a corrupted file returns an error and is NOT written', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-src-'))
    const src = path.join(dir, 'license.json')
    fs.writeFileSync(src, 'NOT-JSON{{{', 'utf-8')

    const res = await importLicenseFromFile(src)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toMatch(/損毀/)
    expect(fs.existsSync(getLicensePath())).toBe(false)
  })
})

describe('findDownloadedLicense (US-105 path 3)', () => {
  it('returns the most recently modified license file, or null when none', () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-dl-empty-'))
    expect(findDownloadedLicense(empty)).toBeNull()

    const dl = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-dl-'))
    fs.writeFileSync(path.join(dl, 'license.json'), '{}')
    fs.writeFileSync(path.join(dl, 'notes.txt'), 'x')
    const found = findDownloadedLicense(dl)
    expect(found).toBe(path.join(dl, 'license.json'))
  })
})
