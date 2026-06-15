import { describe, it, expect, vi } from 'vitest'
import { deriveToken, storeAndDeliver, fetchLicense, type DeliveryEnv } from '../src/delivery'
import { type EmailSender } from '../src/email'
import type { LicenseFile } from '../src/license'

function fakeKV() {
  const store = new Map<string, string>()
  return {
    store,
    get: vi.fn(async (k: string) => (store.has(k) ? store.get(k)! : null)),
    put: vi.fn(async (k: string, v: string) => {
      store.set(k, v)
    }),
    delete: vi.fn(async (k: string) => {
      store.delete(k)
    })
  }
}

const licenseFile: LicenseFile = {
  payload: {
    purchaser_email: 'buyer@example.com',
    purchase_date: '2026-06-15',
    license_id: 'lic-123',
    expires_at: '2027-06-15',
    renewal_eligible_until: '2027-06-15',
    tier: 'pro',
    key_version: 'key_v1',
    founder_tier: null
  },
  signature: 'AAAA'
}

function makeEnv() {
  const kv = fakeKV()
  const send = vi.fn(async (_msg: unknown) => ({ messageId: 'm1' }))
  const env: DeliveryEnv = {
    LICENSES: kv as unknown as KVNamespace,
    LS_WEBHOOK_SECRET: 'whsec',
    EMAIL: { send } as unknown as EmailSender,
    LICENSE_FROM_EMAIL: 'TunnelBox <license@tunnelboxapp.com>'
  }
  return { env, kv, send }
}

describe('deriveToken', () => {
  it('is deterministic for the same secret + order id', async () => {
    const a = await deriveToken('s', 'order-1')
    const b = await deriveToken('s', 'order-1')
    expect(a).toBe(b)
    expect(a).toMatch(/^[0-9a-f]{64}$/)
  })

  it('differs by order id and by secret', async () => {
    expect(await deriveToken('s', 'o1')).not.toBe(await deriveToken('s', 'o2'))
    expect(await deriveToken('s1', 'o')).not.toBe(await deriveToken('s2', 'o'))
  })
})

describe('storeAndDeliver', () => {
  it('stores the license under the derived token and emails the link', async () => {
    const { env, kv, send } = makeEnv()
    const res = await storeAndDeliver(env, {
      licenseFile,
      email: 'buyer@example.com',
      orderId: 'order-1',
      orderNumber: 7,
      origin: 'https://signer.example.com'
    })

    expect(res.delivered).toBe(true)
    const token = await deriveToken('whsec', 'order-1')
    expect(kv.store.get('license:' + token)).toBe(JSON.stringify(licenseFile))

    expect(send).toHaveBeenCalledTimes(1)
    const msg = send.mock.calls[0][0] as {
      to: string
      from: { email: string; name?: string }
      text: string
    }
    expect(msg.to).toBe('buyer@example.com')
    expect(msg.from).toEqual({ email: 'license@tunnelboxapp.com', name: 'TunnelBox' })
    expect(msg.text).toContain(`https://signer.example.com/license/${token}`)
  })

  it('is idempotent — a duplicate order does not re-store or re-email', async () => {
    const { env, send } = makeEnv()
    const p = {
      licenseFile,
      email: 'buyer@example.com',
      orderId: 'order-1',
      origin: 'https://s.example.com'
    }
    const first = await storeAndDeliver(env, p)
    const second = await storeAndDeliver(env, p)
    expect(first.delivered).toBe(true)
    expect(second.delivered).toBe(false)
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('rolls back the KV entry when the email send fails (so LS can retry)', async () => {
    const { env, kv, send } = makeEnv()
    send.mockRejectedValueOnce(new Error('E_INTERNAL_SERVER_ERROR'))
    await expect(
      storeAndDeliver(env, {
        licenseFile,
        email: 'buyer@example.com',
        orderId: 'order-x',
        origin: 'https://s.example.com'
      })
    ).rejects.toThrow(/E_INTERNAL_SERVER_ERROR/)
    const token = await deriveToken('whsec', 'order-x')
    expect(kv.store.has('license:' + token)).toBe(false)
  })
})

describe('fetchLicense', () => {
  it('returns the stored license string, or null for missing/empty tokens', async () => {
    const { env, kv } = makeEnv()
    kv.store.set('license:tok', '{"x":1}')
    expect(await fetchLicense(env, 'tok')).toBe('{"x":1}')
    expect(await fetchLicense(env, 'missing')).toBeNull()
    expect(await fetchLicense(env, '')).toBeNull()
  })
})
