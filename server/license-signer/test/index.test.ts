import { describe, it, expect, vi } from 'vitest'
import worker, { type Env } from '../src/index'
import { type EmailSender } from '../src/email'
import { deriveToken } from '../src/delivery'

const SECRET = 'whsec'
// Any 32-byte hex seed is a valid Ed25519 private key; signature correctness is
// covered by license.test.ts, so a fixed test key keeps this file deterministic.
const PRIV_HEX = 'ab'.repeat(32)

function fakeKV() {
  const store = new Map<string, string>()
  return {
    store,
    get: async (k: string) => (store.has(k) ? store.get(k)! : null),
    put: async (k: string, v: string) => {
      store.set(k, v)
    },
    delete: async (k: string) => {
      store.delete(k)
    }
  }
}

function makeEnv() {
  const kv = fakeKV()
  const send = vi.fn(async () => ({ messageId: 'm1' }))
  const env: Env = {
    LS_WEBHOOK_SECRET: SECRET,
    ED25519_PRIVATE_KEY: PRIV_HEX,
    EMAIL: { send } as unknown as EmailSender,
    LICENSE_FROM_EMAIL: 'TunnelBox <license@x.com>',
    LICENSES: kv as unknown as KVNamespace
  }
  return { env, kv, send }
}

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

describe('worker routes', () => {
  it('order_created webhook signs, stores, and emails (200 + delivered)', async () => {
    const { env, kv, send } = makeEnv()
    const body = JSON.stringify({
      meta: { event_name: 'order_created' },
      data: { id: 'ord-1', attributes: { user_email: 'b@x.com', order_number: 42 } }
    })
    const sig = await hmacHex(body, SECRET)
    const res = await worker.fetch(
      new Request('https://signer.example.com/webhook', {
        method: 'POST',
        headers: { 'X-Signature': sig },
        body
      }),
      env
    )
    expect(res.status).toBe(200)
    const json = (await res.json()) as { ok: boolean; delivered: boolean }
    expect(json.ok).toBe(true)
    expect(json.delivered).toBe(true)
    expect(kv.store.size).toBe(1)
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('rejects a bad webhook signature (401, no work done)', async () => {
    const { env, kv, send } = makeEnv()
    const body = JSON.stringify({
      meta: { event_name: 'order_created' },
      data: { id: 'ord-1', attributes: { user_email: 'b@x.com' } }
    })
    const res = await worker.fetch(
      new Request('https://s/webhook', { method: 'POST', headers: { 'X-Signature': 'deadbeef' }, body }),
      env
    )
    expect(res.status).toBe(401)
    expect(kv.store.size).toBe(0)
    expect(send).not.toHaveBeenCalled()
  })

  it('acks non-order events (202) without storing or emailing', async () => {
    const { env, kv, send } = makeEnv()
    const body = JSON.stringify({ meta: { event_name: 'subscription_created' } })
    const sig = await hmacHex(body, SECRET)
    const res = await worker.fetch(
      new Request('https://s/webhook', { method: 'POST', headers: { 'X-Signature': sig }, body }),
      env
    )
    expect(res.status).toBe(202)
    expect(kv.store.size).toBe(0)
    expect(send).not.toHaveBeenCalled()
  })

  it('GET /license/:token returns the stored file as a license.json attachment', async () => {
    const { env, kv } = makeEnv()
    const token = await deriveToken(SECRET, 'ord-9')
    kv.store.set('license:' + token, '{"payload":{},"signature":"x"}')
    const res = await worker.fetch(new Request(`https://s/license/${token}`), env)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-disposition')).toContain('license.json')
    expect(await res.text()).toBe('{"payload":{},"signature":"x"}')
  })

  it('GET /license/:token 404s for an unknown token', async () => {
    const { env } = makeEnv()
    const res = await worker.fetch(new Request('https://s/license/nope'), env)
    expect(res.status).toBe(404)
  })
})
