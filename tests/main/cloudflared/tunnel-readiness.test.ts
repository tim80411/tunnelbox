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

describe('waitForTunnelReady', () => {
  it('resolves immediately when URL responds with 200', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('ok', { status: 200 }))

    await expect(
      waitForTunnelReady('https://test.trycloudflare.com', { intervalMs: 50, timeoutMs: 500 })
    ).resolves.toBeUndefined()

    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('resolves when URL responds with 502 (edge reached, tunnel not ready yet is still DNS-ok)', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('bad gateway', { status: 502 }))

    await expect(
      waitForTunnelReady('https://test.trycloudflare.com', { intervalMs: 50, timeoutMs: 500 })
    ).resolves.toBeUndefined()
  })

  it('retries on fetch network error (ENOTFOUND) then resolves', async () => {
    const networkError = new TypeError('fetch failed')
    networkError.cause = { code: 'ENOTFOUND' }

    fetchSpy
      .mockRejectedValueOnce(networkError)
      .mockRejectedValueOnce(networkError)
      .mockResolvedValueOnce(new Response('ok', { status: 200 }))

    await expect(
      waitForTunnelReady('https://test.trycloudflare.com', { intervalMs: 50, timeoutMs: 5000 })
    ).resolves.toBeUndefined()

    expect(fetchSpy).toHaveBeenCalledTimes(3)
  })

  it('rejects after timeout when URL never becomes reachable', async () => {
    const networkError = new TypeError('fetch failed')
    fetchSpy.mockRejectedValue(networkError)

    await expect(
      waitForTunnelReady('https://test.trycloudflare.com', { intervalMs: 50, timeoutMs: 200 })
    ).rejects.toThrow('Tunnel URL 驗證逾時')
  })

  it('stops polling when abort signal is triggered', async () => {
    const networkError = new TypeError('fetch failed')
    fetchSpy.mockRejectedValue(networkError)

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
