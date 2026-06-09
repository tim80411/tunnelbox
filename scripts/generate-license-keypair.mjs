#!/usr/bin/env node
/**
 * One-time keypair generation script for TunnelBox license signing (ES-109).
 *
 * Usage: node scripts/generate-license-keypair.mjs
 *
 * Output:
 *   - Prints private key (hex) — store in signer environment only (GitHub Secret /
 *     Cloudflare Workers Secret / 1Password). NEVER commit or bundle in the app.
 *   - Prints public key (hex) — set as TUNNELBOX_LICENSE_PUBKEY_V1 env var at build
 *     time so it gets embedded in the app binary via process.env.
 *
 * Key version: key_v1
 * Rotation: generate a new keypair, add key_v2 entry to EMBEDDED_PUBLIC_KEY_HEX in
 *   verifier.ts, and deploy signer with the new private key.
 */

import * as ed from '@noble/ed25519'

const privateKey = ed.utils.randomSecretKey()
const publicKey = await ed.getPublicKeyAsync(privateKey)

const toHex = (bytes) => Buffer.from(bytes).toString('hex')

console.log('=== TunnelBox License Keypair (key_v1) ===')
console.log()
console.log('PRIVATE KEY (keep secret — signer side only):')
console.log(toHex(privateKey))
console.log()
console.log('PUBLIC KEY (embed in app — set as env var TUNNELBOX_LICENSE_PUBKEY_V1):')
console.log(toHex(publicKey))
console.log()
console.log('Verification test:')
const testMsg = new TextEncoder().encode('tunnelbox-test')
const sig = await ed.signAsync(testMsg, privateKey)
const ok = await ed.verifyAsync(sig, testMsg, publicKey)
console.log('Sign + verify OK:', ok)
