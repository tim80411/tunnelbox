#!/usr/bin/env node
/**
 * Dev-only helper: mint a Pro license for local testing.
 *
 * Generates a fresh Ed25519 keypair, signs a Pro license payload (founder_tier=1
 * by default to also test the Founder badge UI), writes it to the userData
 * location the app reads, and prints the public key hex you must export as
 * TUNNELBOX_LICENSE_PUBKEY_V1 when running `pnpm dev`.
 *
 * Usage:
 *   node scripts/mint-dev-license.mjs                 # founder_tier=1
 *   node scripts/mint-dev-license.mjs --tier=50       # founder_tier=50
 *   node scripts/mint-dev-license.mjs --no-founder    # founder_tier=null (regular Pro)
 *   node scripts/mint-dev-license.mjs --remove        # delete license.dat (revert to Free)
 *
 * After running, restart `pnpm dev` with the printed env var:
 *   TUNNELBOX_LICENSE_PUBKEY_V1=<hex> pnpm dev
 */

import * as ed from '@noble/ed25519'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const args = process.argv.slice(2)
const tierArg = args.find((a) => a.startsWith('--tier='))
const noFounder = args.includes('--no-founder')
const remove = args.includes('--remove')

const founderTier = noFounder ? null : tierArg ? parseInt(tierArg.split('=')[1], 10) : 1

// macOS userData path for Electron app "TunnelBox"
function userDataDir() {
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'TunnelBox')
  }
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA ?? '', 'TunnelBox')
  }
  return path.join(os.homedir(), '.config', 'TunnelBox')
}

const licensePath = path.join(userDataDir(), 'license.dat')

if (remove) {
  if (fs.existsSync(licensePath)) {
    fs.unlinkSync(licensePath)
    console.log(`✓ Removed ${licensePath}`)
    console.log(`  Restart dev — app is now in Free tier.`)
  } else {
    console.log(`License not found at ${licensePath} (already Free).`)
  }
  process.exit(0)
}

const privateKey = ed.utils.randomSecretKey()
const publicKey = await ed.getPublicKeyAsync(privateKey)
const toHex = (b) => Buffer.from(b).toString('hex')

const today = new Date()
const expiresAt = new Date(today)
expiresAt.setFullYear(today.getFullYear() + 10)

const payload = {
  license_id: `dev-${Date.now()}`,
  purchaser_email: 'dev@tunnelbox.local',
  purchase_date: today.toISOString().slice(0, 10),
  expires_at: expiresAt.toISOString().slice(0, 10),
  tier: 'pro',
  key_version: 'key_v1',
  founder_tier: founderTier
}

// Canonical JSON: sorted keys, no whitespace — matches verifier.ts canonicalJson()
const canonical = JSON.stringify(
  Object.fromEntries(Object.entries(payload).sort(([a], [b]) => a.localeCompare(b)))
)
const sig = await ed.signAsync(new TextEncoder().encode(canonical), privateKey)
const signature = Buffer.from(sig).toString('base64')

fs.mkdirSync(userDataDir(), { recursive: true })
fs.writeFileSync(licensePath, JSON.stringify({ payload, signature }, null, 2), 'utf-8')

console.log('=== TunnelBox Dev License Minted ===')
console.log()
console.log(`License file:  ${licensePath}`)
console.log(`Tier:          pro`)
console.log(`Founder tier:  ${founderTier ?? 'null (regular Pro, no badge)'}`)
console.log(`Expires:       ${payload.expires_at}`)
console.log()
console.log('Public key (hex) — restart dev with this env var:')
console.log()
console.log(`  TUNNELBOX_LICENSE_PUBKEY_V1=${toHex(publicKey)} pnpm dev`)
console.log()
console.log('Or persist for this terminal session:')
console.log()
console.log(`  export TUNNELBOX_LICENSE_PUBKEY_V1=${toHex(publicKey)}`)
console.log(`  pnpm dev`)
console.log()
console.log('To revert to Free tier:  node scripts/mint-dev-license.mjs --remove')
