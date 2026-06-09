import { describe, it, expect } from 'vitest'
import { mapOrderToLicenseInput, verifyWebhookSignature, type LemonSqueezyEvent } from '../src/lemonsqueezy'

const SECRET = 'test-signing-secret'

async function hmacHex(body: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body))
  let hex = ''
  for (const b of new Uint8Array(mac)) hex += b.toString(16).padStart(2, '0')
  return hex
}

describe('verifyWebhookSignature', () => {
  const body = JSON.stringify({ meta: { event_name: 'order_created' } })

  it('accepts a correctly signed body', async () => {
    const sig = await hmacHex(body, SECRET)
    expect(await verifyWebhookSignature(body, sig, SECRET)).toBe(true)
  })

  it('rejects a wrong signature', async () => {
    const sig = await hmacHex(body, 'wrong-secret')
    expect(await verifyWebhookSignature(body, sig, SECRET)).toBe(false)
  })

  it('rejects a tampered body', async () => {
    const sig = await hmacHex(body, SECRET)
    expect(await verifyWebhookSignature(body + ' ', sig, SECRET)).toBe(false)
  })

  it('rejects a missing signature header', async () => {
    expect(await verifyWebhookSignature(body, null, SECRET)).toBe(false)
  })
})

describe('mapOrderToLicenseInput', () => {
  it('extracts the purchaser email', () => {
    const event: LemonSqueezyEvent = {
      meta: { event_name: 'order_created' },
      data: { id: '123', attributes: { user_email: 'buyer@example.com' } }
    }
    const input = mapOrderToLicenseInput(event)
    expect(input.purchaserEmail).toBe('buyer@example.com')
    expect(input.founderTier).toBeNull()
  })

  it('throws when user_email is absent', () => {
    expect(() => mapOrderToLicenseInput({ data: { attributes: {} } })).toThrow(/user_email/)
  })
})
