import { buildLicensePayload, signLicense } from './license'
import { mapOrderToLicenseInput, verifyWebhookSignature, type LemonSqueezyEvent } from './lemonsqueezy'
import { storeAndDeliver, fetchLicense } from './delivery'
import { type EmailSender } from './email'

export interface Env {
  /** LemonSqueezy webhook signing secret (set via `wrangler secret put LS_WEBHOOK_SECRET`). */
  LS_WEBHOOK_SECRET: string
  /** Ed25519 private key, hex-encoded (set via `wrangler secret put ED25519_PRIVATE_KEY`). */
  ED25519_PRIVATE_KEY: string
  /** Cloudflare Email Service binding for delivering the license email. */
  EMAIL: EmailSender
  /** From address on a domain onboarded to Email Sending (wrangler.toml [vars]). */
  LICENSE_FROM_EMAIL: string
  /** KV namespace holding signed licenses keyed by download token. */
  LICENSES: KVNamespace
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url)

    // Buyer license download: GET /license/:token — the link emailed after purchase.
    if (req.method === 'GET' && url.pathname.startsWith('/license/')) {
      const token = url.pathname.slice('/license/'.length)
      const license = await fetchLicense(env, token)
      if (!license) return new Response('Not Found', { status: 404 })
      return new Response(license, {
        status: 200,
        headers: {
          'content-type': 'application/json',
          'content-disposition': 'attachment; filename="license.json"'
        }
      })
    }

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

    const orderId = event.data?.id
    if (!orderId) return new Response('order payload missing id', { status: 400 })

    // 3. Sign the license (same canonical-JSON + @noble/ed25519 the app verifies with).
    const payload = buildLicensePayload(mapOrderToLicenseInput(event))
    const licenseFile = await signLicense(payload, env.ED25519_PRIVATE_KEY)

    // 4. Store + email the buyer a download link (idempotent per order id).
    const result = await storeAndDeliver(env, {
      licenseFile,
      email: payload.purchaser_email,
      orderId,
      orderNumber: event.data?.attributes?.order_number,
      origin: url.origin
    })

    return new Response(
      JSON.stringify({ ok: true, license_id: payload.license_id, delivered: result.delivered }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    )
  }
}
