import { describe, it, expect, vi, afterEach } from 'vitest'
import http from 'node:http'
import https from 'node:https'
import { readFileSync } from 'node:fs'

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

const TLS_KEY = readFileSync(new URL('../fixtures/test-key.pem', import.meta.url))
const TLS_CERT = readFileSync(new URL('../fixtures/test-cert.pem', import.meta.url))

function get(port: number, host: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: '/', headers: { host } }, (res) => {
      let body = ''
      res.on('data', (c) => (body += c))
      res.on('end', () => resolve({ status: res.statusCode || 0, body }))
    })
    req.on('error', reject)
    req.end()
  })
}

function postWithBody(port: number, body: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: '127.0.0.1', port, path: '/', method: 'POST',
        headers: { host: '127.0.0.1', 'content-length': Buffer.byteLength(body) }
      },
      (res) => { res.resume(); res.on('end', () => resolve()) }
    )
    req.on('error', reject)
    req.end(body)
  })
}

describe('createProxyServer https upstream (TIM-318 / F16)', () => {
  const closers: Array<() => void> = []
  afterEach(() => { closers.forEach((c) => c()); closers.length = 0 })

  it('connects to an https target over TLS (not plaintext) and proxies the response', async () => {
    const upstream = https.createServer({ key: TLS_KEY, cert: TLS_CERT }, (_req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain' })
      res.end('secure-ok')
    })
    closers.push(() => upstream.close())
    const upPort = await listen(upstream as unknown as http.Server)
    const proxy = createProxyServer(`https://127.0.0.1:${upPort}`, { isHostAllowed: () => true })
    closers.push(() => proxy.close())
    const proxyPort = await listen(proxy)
    const { status, body } = await get(proxyPort, '127.0.0.1')
    expect(status).toBe(200)
    expect(body).toBe('secure-ok')
  })
})

describe('createProxyServer Content-Length forwarding (TIM-318 / F25)', () => {
  const closers: Array<() => void> = []
  afterEach(() => { closers.forEach((c) => c()); closers.length = 0 })

  it('does not forward the client Content-Length to the upstream', async () => {
    let received: http.IncomingHttpHeaders = {}
    const upstream = http.createServer((req, res) => {
      received = req.headers
      req.resume()
      req.on('end', () => { res.writeHead(200); res.end('ok') })
    })
    closers.push(() => upstream.close())
    const upPort = await listen(upstream)
    const proxy = createProxyServer(`http://127.0.0.1:${upPort}`, { isHostAllowed: () => true })
    closers.push(() => proxy.close())
    const proxyPort = await listen(proxy)
    await postWithBody(proxyPort, 'hello-body')
    // Proxy strips client Content-Length; Node re-frames the piped body as chunked.
    expect(received['content-length']).toBeUndefined()
    expect(received['transfer-encoding']).toBe('chunked')
  })
})
