import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock electron app (needed by logger)
vi.mock('electron', () => ({
  app: { isPackaged: false },
}))

import { waitForTunnelReady } from '../../../src/main/cloudflared/tunnel-readiness'

// Spy on global fetch
let fetchSpy: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchSpy = vi.fn()
  vi.stubGlobal('fetch', fetchSpy)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

// Helper: DoH JSON response
function dohResponse(status: number, answers?: Array<{ name: string; type: number; data: string }>) {
  return new Response(JSON.stringify({ Status: status, Answer: answers }), {
    status: 200,
    headers: { 'content-type': 'application/dns-json' },
  })
}

// Helper: match DoH vs tunnel fetch
function isDohRequest(url: string | URL | Request): boolean {
  const u = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url
  return u.includes('dns-query')
}

describe('waitForTunnelReady', () => {
  it('resolves when DoH confirms DNS and fetch succeeds', async () => {
    fetchSpy.mockImplementation((url: string) => {
      if (isDohRequest(url)) return Promise.resolve(dohResponse(0, [{ name: 'test', type: 1, data: '1.2.3.4' }]))
      return Promise.resolve(new Response('ok', { status: 200 }))
    })

    await expect(
      waitForTunnelReady('https://test.trycloudflare.com', { intervalMs: 50, timeoutMs: 1000 })
    ).resolves.toBeUndefined()
  })

  it('resolves when URL responds with 502', async () => {
    fetchSpy.mockImplementation((url: string) => {
      if (isDohRequest(url)) return Promise.resolve(dohResponse(0, [{ name: 'test', type: 1, data: '1.2.3.4' }]))
      return Promise.resolve(new Response('bad gateway', { status: 502 }))
    })

    await expect(
      waitForTunnelReady('https://test.trycloudflare.com', { intervalMs: 50, timeoutMs: 1000 })
    ).resolves.toBeUndefined()
  })

  it('waits for DoH DNS propagation before fetch', async () => {
    let dohCalls = 0
    fetchSpy.mockImplementation((url: string) => {
      if (isDohRequest(url)) {
        dohCalls++
        if (dohCalls <= 2) return Promise.resolve(dohResponse(3)) // NXDOMAIN
        return Promise.resolve(dohResponse(0, [{ name: 'test', type: 1, data: '1.2.3.4' }]))
      }
      return Promise.resolve(new Response('ok', { status: 200 }))
    })

    await expect(
      waitForTunnelReady('https://test.trycloudflare.com', { intervalMs: 50, timeoutMs: 5000 })
    ).resolves.toBeUndefined()

    expect(dohCalls).toBe(3)
  })

  it('falls through to fetch when DoH phase times out', async () => {
    fetchSpy.mockImplementation((url: string) => {
      if (isDohRequest(url)) return Promise.resolve(dohResponse(3)) // always NXDOMAIN
      return Promise.resolve(new Response('ok', { status: 200 }))
    })

    await expect(
      waitForTunnelReady('https://test.trycloudflare.com', { intervalMs: 50, timeoutMs: 600 })
    ).resolves.toBeUndefined()
  })

  it('retries on fetch network error then resolves', async () => {
    let fetchCalls = 0
    fetchSpy.mockImplementation((url: string) => {
      if (isDohRequest(url)) return Promise.resolve(dohResponse(0, [{ name: 'test', type: 1, data: '1.2.3.4' }]))
      fetchCalls++
      if (fetchCalls <= 2) return Promise.reject(new TypeError('fetch failed'))
      return Promise.resolve(new Response('ok', { status: 200 }))
    })

    await expect(
      waitForTunnelReady('https://test.trycloudflare.com', { intervalMs: 50, timeoutMs: 5000 })
    ).resolves.toBeUndefined()

    expect(fetchCalls).toBe(3)
  })

  it('rejects after timeout when both DoH and fetch fail', async () => {
    fetchSpy.mockImplementation((url: string) => {
      if (isDohRequest(url)) return Promise.resolve(dohResponse(3))
      return Promise.reject(new TypeError('fetch failed'))
    })

    await expect(
      waitForTunnelReady('https://test.trycloudflare.com', { intervalMs: 50, timeoutMs: 500 })
    ).rejects.toThrow('Tunnel URL 驗證逾時')
  })

  it('stops polling when abort signal is triggered', async () => {
    fetchSpy.mockImplementation((url: string) => {
      if (isDohRequest(url)) return Promise.resolve(dohResponse(3))
      return Promise.reject(new TypeError('fetch failed'))
    })

    const controller = new AbortController()
    setTimeout(() => controller.abort(), 100)

    await expect(
      waitForTunnelReady('https://test.trycloudflare.com', {
        intervalMs: 50,
        timeoutMs: 5000,
        signal: controller.signal,
      })
    ).rejects.toThrow('Tunnel 驗證已取消')
  })
})
