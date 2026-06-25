import { describe, it, expect, vi, afterEach } from 'vitest'
import http from 'node:http'

// proxy-server → logger → electron; mock the only thing logger touches (app.isPackaged).
vi.mock('electron', () => ({ app: { isPackaged: true } }))

import { createProxyServer } from '@/main/proxy-server'

function listen(server: http.Server): Promise<number> {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      resolve(typeof addr === 'object' && addr ? addr.port : 0)
    })
  })
}

function getStatus(port: number, host: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: '/', headers: { host } }, (res) => {
      res.resume()
      res.on('end', () => resolve(res.statusCode || 0))
    })
    req.on('error', reject)
    req.end()
  })
}

describe('createProxyServer Host guard (TIM-315 / F15)', () => {
  const servers: http.Server[] = []
  afterEach(() => {
    servers.forEach((s) => s.close())
    servers.length = 0
  })

  it('returns 403 when the Host guard rejects the request (DNS rebinding)', async () => {
    // Upstream 127.0.0.1:1 is unreachable, but the guard must reject BEFORE proxying.
    const server = createProxyServer('http://127.0.0.1:1', { isHostAllowed: () => false })
    servers.push(server)
    const port = await listen(server)
    expect(await getStatus(port, 'attacker.com')).toBe(403)
  })

  it('passes the guard (502 to the dead upstream) when the Host is allowed', async () => {
    const server = createProxyServer('http://127.0.0.1:1', { isHostAllowed: () => true })
    servers.push(server)
    const port = await listen(server)
    expect(await getStatus(port, '127.0.0.1')).toBe(502)
  })

  it('serves without a guard for back-compat when no options are given', async () => {
    const server = createProxyServer('http://127.0.0.1:1')
    servers.push(server)
    const port = await listen(server)
    expect(await getStatus(port, 'anything')).toBe(502)
  })
})
