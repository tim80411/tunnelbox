import type { LicenseInput } from './license'

/**
 * Verify a LemonSqueezy webhook request.
 * LS signs the raw request body with HMAC-SHA256 (your store's signing secret)
 * and sends the hex digest in the `X-Signature` header.
 * See https://docs.lemonsqueezy.com/help/webhooks/signing-requests
 */
export async function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string
): Promise<boolean> {
  if (!signatureHeader || !secret) return false
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody))
  const expected = hexFromBytes(new Uint8Array(mac))
  return timingSafeEqual(expected, signatureHeader.trim())
}

/** Minimal shape of the LS `order_created` payload we depend on. */
export interface LemonSqueezyEvent {
  meta?: { event_name?: string; custom_data?: Record<string, unknown> }
  data?: {
    id?: string
    attributes?: {
      user_email?: string
      order_number?: number
      created_at?: string
    }
  }
}

/**
 * Map a LemonSqueezy order into the license input.
 *
 * NOTE on founder_tier: the first 100 paid orders get founder_tier 1-100, the
 * rest null. Determining "is this order in the first 100?" reliably needs a
 * durable counter (e.g. a Workers KV/D1 increment keyed on order id for
 * idempotency) — `order_number` from LS is store-wide and not a safe proxy.
 * Left as a deployment decision; defaults to null here.
 */
export function mapOrderToLicenseInput(event: LemonSqueezyEvent): LicenseInput {
  const email = event.data?.attributes?.user_email
  if (!email) throw new Error('order payload missing user_email')
  return {
    purchaserEmail: email,
    founderTier: null // TODO(founder): assign 1-100 via a durable order counter
  }
}

function hexFromBytes(bytes: Uint8Array): string {
  let hex = ''
  for (const b of bytes) hex += b.toString(16).padStart(2, '0')
  return hex
}

/** Constant-time string compare (avoids leaking the signature via timing). */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}
