import { buildLicensePayload, signLicense } from './license'
import { mapOrderToLicenseInput, verifyWebhookSignature, type LemonSqueezyEvent } from './lemonsqueezy'

export interface Env {
  /** LemonSqueezy webhook signing secret (set via `wrangler secret put LS_WEBHOOK_SECRET`). */
  LS_WEBHOOK_SECRET: string
  /** Ed25519 private key, hex-encoded (set via `wrangler secret put ED25519_PRIVATE_KEY`). */
  ED25519_PRIVATE_KEY: string
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url)
    if (req.method !== 'POST' || url.pathname !== '/webhook') {
      return new Response('Not Found', { status: 404 })
    }

    // 1. Verify the LemonSqueezy HMAC over the RAW body before trusting anything.
    const raw = await req.text()
    const valid = await verifyWebhookSignature(raw, req.headers.get('X-Signature'), env.LS_WEBHOOK_SECRET)
    if (!valid) return new Response('Invalid signature', { status: 401 })

    let event: LemonSqueezyEvent
    try {
      event = JSON.parse(raw)
    } catch {
      return new Response('Bad JSON', { status: 400 })
    }

    // 2. Only act on completed orders. Ack everything else so LS stops retrying.
    const eventName = req.headers.get('X-Event-Name') ?? event.meta?.event_name
    if (eventName !== 'order_created') {
      return new Response(JSON.stringify({ ok: true, ignored: eventName ?? 'unknown' }), {
        status: 202,
        headers: { 'content-type': 'application/json' }
      })
    }

    // 3. Sign the license (same canonical-JSON + @noble/ed25519 the app verifies with).
    const payload = buildLicensePayload(mapOrderToLicenseInput(event))
    const licenseFile = await signLicense(payload, env.ED25519_PRIVATE_KEY)

    // 4. Deliver to the buyer.
    // TODO(delivery): persist + deliver `licenseFile`. Two viable paths, both need
    //   the user's LS API key (and KV/R2 for Option B):
    //     A. POST it back as a LemonSqueezy order attachment via the LS API.
    //     B. store in KV/R2 and email a download link.
    //   Left for deployment — see README "Delivery".

    return new Response(JSON.stringify({ ok: true, license_id: payload.license_id }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    })
  }
}
