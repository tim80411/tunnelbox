# TunnelBox License Signer (TIM-214 / Story 110)

A small Cloudflare Worker that turns a **LemonSqueezy `order_created` webhook** into a
**signed `license.json`** the TunnelBox app can verify offline.

Platform choice (Cloudflare Workers) and the comparison vs Deno Deploy / Vercel:
see `.project/specs/charging-method/spike-signer-platform-selection.md`.

## Why Workers + `@noble/ed25519`

The app verifies licenses with `@noble/ed25519` and a sorted-keys canonical JSON
(`src/main/license/verifier.ts`). This signer uses the **same library and the same
canonicalization** (`src/license.ts`), so a signed license is guaranteed to verify
in the app. `test/license.test.ts` re-implements the app's verify path and asserts
the round-trip — if the two ever drift, the test fails.

## Flow

```
LemonSqueezy order_created ──POST /webhook──▶ Worker
   1. HMAC-SHA256 verify raw body vs X-Signature  (LS_WEBHOOK_SECRET)
   2. build LicensePayload from order
   3. Ed25519 detached-sign canonical JSON        (ED25519_PRIVATE_KEY)
   4. deliver { payload, signature } to buyer     (TODO — see Delivery)
```

## Setup

```bash
cd server/license-signer
npm install            # or pnpm install

# Generate the keypair (run from repo root — uses the app's script):
node ../../scripts/generate-license-keypair.mjs
#   → PRIVATE KEY hex  → set as the signer secret (below)
#   → PUBLIC KEY hex   → set as TUNNELBOX_LICENSE_PUBKEY_V1 in the app build

wrangler secret put ED25519_PRIVATE_KEY     # paste the PRIVATE key hex
wrangler secret put LS_WEBHOOK_SECRET        # LemonSqueezy store signing secret

wrangler deploy
```

Then point a LemonSqueezy webhook at `https://<worker-domain>/webhook` for the
`order_created` event, using the same signing secret.

## Test

```bash
npm test           # vitest — sign↔verify round-trip + HMAC verification
```

## Delivery (TODO — needs your LS account)

Step 4 (`src/index.ts`) is intentionally a stub. Two viable paths, both requiring
your LemonSqueezy API key (and a KV/R2 binding for B):

- **A. LS order attachment** — POST the signed `license.json` back to the order via
  the LemonSqueezy API so it appears on the buyer's receipt/download.
- **B. Store + email** — write to Workers KV/R2 and email a download link.

Until this is wired, the Worker verifies + signs and returns `{ ok, license_id }`
but does not yet hand the file to the buyer.

## Security notes

- `ED25519_PRIVATE_KEY` lives only as a Workers secret (write-only after `put`).
  Never commit it; never ship it in the app — the app only embeds the **public** key.
- The webhook HMAC is verified over the **raw** body with a constant-time compare
  before any work is done.
- Idempotency (dedupe repeat LS deliveries by order id) should be added alongside
  the founder-tier counter when delivery is implemented.
