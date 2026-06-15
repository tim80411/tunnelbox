/**
 * License delivery (Path B): store the signed license in Workers KV under an
 * unguessable token, then email the buyer a download link.
 *
 * Idempotency: the token is HMAC(LS_WEBHOOK_SECRET, orderId), so LemonSqueezy
 * webhook retries for the same order resolve to the same KV entry and we never
 * sign/store/email twice. If the email send fails we delete the entry so the
 * next retry delivers cleanly.
 */
import type { LicenseFile } from './license'
import { sendLicenseEmail, type EmailEnv } from './email'

const KEY_PREFIX = 'license:'

export interface DeliveryEnv extends EmailEnv {
  LICENSES: KVNamespace
  /** Reused to derive the per-order download token (already a secret). */
  LS_WEBHOOK_SECRET: string
}

export interface DeliverParams {
  licenseFile: LicenseFile
  email: string
  orderId: string
  orderNumber?: number
  /** Origin of the incoming request, used to build the download URL. */
  origin: string
}

export interface DeliverResult {
  token: string
  /** false when this was a duplicate webhook (already delivered earlier). */
  delivered: boolean
}

/** Deterministic, unguessable per-order token: HMAC-SHA256(secret, "order:"+id). */
export async function deriveToken(secret: string, orderId: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`order:${orderId}`))
  let hex = ''
  for (const b of new Uint8Array(mac)) hex += b.toString(16).padStart(2, '0')
  return hex
}

export async function storeAndDeliver(env: DeliveryEnv, p: DeliverParams): Promise<DeliverResult> {
  const token = await deriveToken(env.LS_WEBHOOK_SECRET, p.orderId)
  const kvKey = KEY_PREFIX + token

  // Idempotency: a retry for the same order is a no-op (already delivered).
  if (await env.LICENSES.get(kvKey)) return { token, delivered: false }

  await env.LICENSES.put(kvKey, JSON.stringify(p.licenseFile), {
    metadata: { email: p.email, license_id: p.licenseFile.payload.license_id }
  })

  try {
    await sendLicenseEmail(env, {
      to: p.email,
      downloadUrl: `${p.origin}/license/${token}`,
      orderNumber: p.orderNumber
    })
  } catch (err) {
    // Email failed — roll back so the next LS retry re-attempts delivery.
    await env.LICENSES.delete(kvKey)
    throw err
  }

  return { token, delivered: true }
}

/** Returns the stored license JSON string for a download token, or null. */
export async function fetchLicense(env: { LICENSES: KVNamespace }, token: string): Promise<string | null> {
  if (!token) return null
  return env.LICENSES.get(KEY_PREFIX + token)
}
