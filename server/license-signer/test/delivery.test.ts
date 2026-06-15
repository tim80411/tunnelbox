import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { deriveToken, storeAndDeliver, fetchLicense, type DeliveryEnv } from '../src/delivery'
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

function makeEnv(kv = fakeKV()): { env: DeliveryEnv; kv: ReturnType<typeof fakeKV> } {
  const env: DeliveryEnv = {
    LICENSES: kv as unknown as KVNamespace,
    LS_WEBHOOK_SECRET: 'whsec',
    RESEND_API_KEY: 're_test',
    LICENSE_FROM_EMAIL: 'TunnelBox <license@tunnelboxapp.com>'
  }
  return { env, kv }
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
  let fetchMock: ReturnType<typeof vi.fn>
  beforeEach(() => {
    fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: 'email_1' }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => vi.unstubAllGlobals())

  it('stores the license under the derived token and emails the link', async () => {
    const { env, kv } = makeEnv()
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

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.resend.com/emails')
    expect(init.headers.Authorization).toBe('Bearer re_test')
    const body = JSON.parse(init.body)
    expect(body.to).toBe('buyer@example.com')
    expect(body.text).toContain(`https://signer.example.com/license/${token}`)
  })

  it('is idempotent — a duplicate order does not re-store or re-email', async () => {
    const { env } = makeEnv()
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
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('rolls back the KV entry when the email send fails (so LS can retry)', async () => {
    fetchMock.mockResolvedValueOnce(new Response('rate limited', { status: 429 }))
    const { env, kv } = makeEnv()
    await expect(
      storeAndDeliver(env, {
        licenseFile,
        email: 'buyer@example.com',
        orderId: 'order-x',
        origin: 'https://s.example.com'
      })
    ).rejects.toThrow(/Resend email failed/)
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
