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
pnpm install            # or npm install

# 1. Create the KV namespace for signed licenses, then paste the printed id into wrangler.toml.
wrangler kv namespace create LICENSES

# 2. Secrets. The Ed25519 private key already lives in OCI (generated at launch) —
#    pipe it straight into the secret so it never touches disk:
oci os object get --bucket-name tunnelbox-secrets \
  --name license-signer/ed25519-private-v1.hex --file - | wrangler secret put ED25519_PRIVATE_KEY
wrangler secret put LS_WEBHOOK_SECRET    # LemonSqueezy store webhook signing secret

# 3. Onboard the sending domain for Cloudflare Email Service (no API key), and make
#    LICENSE_FROM_EMAIL in wrangler.toml [vars] an address on that domain:
wrangler email sending enable tunnelboxapp.com

wrangler deploy
```

Then point a LemonSqueezy webhook at `https://<worker-domain>/webhook` for the
`order_created` event, using the same signing secret. The matching **public** key
is already embedded in the app (key_v1).

## Test

```bash
npm test           # vitest — sign↔verify round-trip + HMAC verification
```

## Delivery (implemented — Path B: KV + email)

On `order_created` the Worker signs the license, stores it in Workers KV under an
unguessable token, and emails the buyer a download link (`src/delivery.ts`,
`src/email.ts`):

- **Token** = `HMAC(LS_WEBHOOK_SECRET, orderId)` — unguessable and deterministic, so
  LemonSqueezy webhook retries map to the same entry and never double-email. If the
  email send fails the KV entry is rolled back so the next retry redelivers.
- **Download** — `GET /license/:token` returns the signed license as a `license.json`
  attachment (matches the app's import filter + Downloads scan).
- **Email** — sent via the Cloudflare Email Service `send_email` binding (no API key);
  swap providers by editing only `src/email.ts`. The from-domain must be onboarded
  with `wrangler email sending enable <domain>`.

`founder_tier` is still `null` (the first-100 counter is deferred — see
`lemonsqueezy.ts`); Founder badges won't be awarded until that durable counter
is added.

## Security notes

- `ED25519_PRIVATE_KEY` lives only as a Workers secret (write-only after `put`).
  Never commit it; never ship it in the app — the app only embeds the **public** key.
- The webhook HMAC is verified over the **raw** body with a constant-time compare
  before any work is done.
- Idempotency (dedupe repeat LS deliveries by order id) should be added alongside
  the founder-tier counter when delivery is implemented.
