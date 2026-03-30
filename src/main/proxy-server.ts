import http from 'node:http'
import net from 'node:net'
import { createLogger } from './logger'
import { acquireConnection, releaseConnection } from './rate-limiter'

const log = createLogger('ProxyServer')

/** Hop-by-hop headers that MUST NOT be forwarded by a proxy (RFC 2616 §13.5.1). */
const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailers',
  'transfer-encoding',
  'upgrade',
])

/** Headers that may leak credentials when routed through a tunnel. */
const SENSITIVE_REQUEST_HEADERS = new Set([
  'authorization',
  'cookie',
  'proxy-authorization',
])

/**
 * Sanitize request headers before forwarding to the target.
 *
 * - Strips hop-by-hop headers (except `upgrade` when it is a WebSocket upgrade)
 * - Strips sensitive credential headers
 * - Adds standard proxy headers (`x-forwarded-for`, `-proto`, `-host`)
 */
function sanitizeRequestHeaders(
  raw: http.IncomingHttpHeaders,
  clientReq: http.IncomingMessage,
  targetHost: string,
  isWebSocketUpgrade = false,
): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {}

  for (const [key, value] of Object.entries(raw)) {
    if (value === undefined) continue
    const lower = key.toLowerCase()

    // Keep the `upgrade` header only for actual WebSocket upgrades
    if (lower === 'upgrade' && isWebSocketUpgrade) {
      out[key] = value
      continue
    }

    if (HOP_BY_HOP_HEADERS.has(lower)) continue
    if (SENSITIVE_REQUEST_HEADERS.has(lower)) continue

    out[key] = value
  }

  // Override host to the target
  out['host'] = targetHost

  // Standard proxy headers
  const clientIp = clientReq.socket?.remoteAddress || '127.0.0.1'
  out['x-forwarded-for'] = clientIp
  out['x-forwarded-proto'] = 'http'
  out['x-forwarded-host'] = raw['host'] || targetHost

  return out
}

/**
 * Sanitize response headers before sending back to the client.
 *
 * - Strips hop-by-hop headers
 * - Removes `set-cookie` to prevent the target from setting cookies on the
 *   tunnel domain (cookie-tossing prevention)
 */
function sanitizeResponseHeaders(
  raw: http.IncomingHttpHeaders,
): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {}

  for (const [key, value] of Object.entries(raw)) {
    if (value === undefined) continue
    const lower = key.toLowerCase()

    if (HOP_BY_HOP_HEADERS.has(lower)) continue
    if (lower === 'set-cookie') continue

    out[key] = value
  }

  return out
}

/**
 * Sanitize a header value by stripping CR/LF characters to prevent CRLF
 * injection when manually constructing HTTP request lines.
 */
function sanitizeHeaderValue(value: string): string {
  return value.replace(/[\r\n]/g, '')
}

/**
 * Return true when the incoming request looks like a valid WebSocket upgrade.
 */
function isValidWebSocketUpgrade(req: http.IncomingMessage): boolean {
  const upgrade = (req.headers['upgrade'] || '').toLowerCase()
  const connection = (req.headers['connection'] || '').toLowerCase()
  return upgrade === 'websocket' && connection.includes('upgrade')
}

/** Maximum concurrent connections per proxy target. */
const MAX_CONNECTIONS_PER_TARGET = 100

/**
 * Create an HTTP server that reverse-proxies all requests (including WebSocket
 * upgrade) to the given target URL.
 *
 * Uses only Node.js built-in modules — no external proxy library.
 * The server is NOT started; the caller must call listen().
 */
export function createProxyServer(target: string): http.Server {
  const targetUrl = new URL(target)
  const isHttps = targetUrl.protocol === 'https:'
  const targetPort = targetUrl.port
    ? Number(targetUrl.port)
    : isHttps
      ? 443
      : 80
  const targetHost = targetUrl.hostname
  const targetBasePath = targetUrl.pathname.replace(/\/$/, '')

  function error502(res: http.ServerResponse): void {
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(
        `<html><body style="font-family:sans-serif;padding:40px;text-align:center;">` +
        `<h2>502 Bad Gateway</h2>` +
        `<p>Cannot reach the upstream server.</p>` +
        `<p style="color:#888;">Make sure the dev server is running.</p>` +
        `</body></html>`
      )
    } else {
      res.end()
    }
  }

  const connectionKey = `proxy:${target}`

  function error503(res: http.ServerResponse): void {
    if (!res.headersSent) {
      res.writeHead(503, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(
        `<html><body style="font-family:sans-serif;padding:40px;text-align:center;">` +
        `<h2>503 Service Unavailable</h2>` +
        `<p>Too many concurrent connections to <code>${target}</code></p>` +
        `</body></html>`
      )
    } else {
      res.end()
    }
  }

  const httpServer = http.createServer((clientReq, clientRes) => {
    const startTime = Date.now()

    // Enforce concurrent connection limit per proxy target
    if (!acquireConnection(connectionKey, MAX_CONNECTIONS_PER_TARGET)) {
      log.warn(`Connection limit reached for proxy target ${target}`)
      error503(clientRes)
      return
    }

    // Release the connection slot when the response finishes or errors
    const release = (): void => { releaseConnection(connectionKey) }
    clientRes.on('close', release)
    clientRes.on('error', release)

    // Buffer request body for logging (max 64KB)
    const bodyChunks: Buffer[] = []
    let bodySize = 0
    const BODY_CAPTURE_LIMIT = 64 * 1024

    clientReq.on('data', (chunk: Buffer) => {
      bodySize += chunk.length
      if (bodySize <= BODY_CAPTURE_LIMIT) {
        bodyChunks.push(chunk)
      }
    })

    const targetPath = targetBasePath + (clientReq.url || '/')

    const options: http.RequestOptions = {
      hostname: targetHost,
      port: targetPort,
      path: targetPath,
      method: clientReq.method,
      headers: sanitizeRequestHeaders(
        clientReq.headers,
        clientReq,
        targetUrl.host,
      ),
    }

    const proxyReq = http.request(options, (proxyRes) => {
      httpServer.emit('proxy:success')
      const headers = sanitizeResponseHeaders(proxyRes.headers)
      clientRes.writeHead(proxyRes.statusCode || 502, headers)
      proxyRes.pipe(clientRes)

      // Emit request-complete for logging
      const requestBody = bodySize > 0
        ? Buffer.concat(bodyChunks).toString('utf-8')
        : null

      httpServer.emit('proxy:request-complete', {
        method: clientReq.method || 'GET',
        path: clientReq.url || '/',
        statusCode: proxyRes.statusCode || 0,
        duration: Date.now() - startTime,
        requestHeaders: clientReq.headers,
        responseHeaders: proxyRes.headers,
        requestBody,
        requestBodySize: bodySize,
        requestBodyTruncated: bodySize > BODY_CAPTURE_LIMIT,
      })
    })

    proxyReq.on('error', (err) => {
      log.error(`Proxy error for target ${target}:`, err.message)
      httpServer.emit('proxy:error')
      error502(clientRes)
    })

    clientReq.pipe(proxyReq)
  })

  // WebSocket upgrade handling
  httpServer.on('upgrade', (clientReq, clientSocket, head) => {
    // TIM-80: Validate the request is actually a WebSocket upgrade
    if (!isValidWebSocketUpgrade(clientReq)) {
      log.error('Rejected non-WebSocket upgrade request')
      try { (clientSocket as net.Socket).destroy() } catch { /* already destroyed */ }
      return
    }

    // Enforce concurrent connection limit for WS upgrades too
    if (!acquireConnection(connectionKey, MAX_CONNECTIONS_PER_TARGET)) {
      log.warn(`Connection limit reached (WS upgrade) for proxy target ${target}`)
      const sock = clientSocket as net.Socket
      sock.write('HTTP/1.1 503 Service Unavailable\r\n\r\n')
      sock.destroy()
      return
    }

    const releaseWs = (): void => { releaseConnection(connectionKey) }
    ;(clientSocket as net.Socket).on('close', releaseWs)

    const targetPath = targetBasePath + (clientReq.url || '/')

    const proxySocket = net.connect(targetPort, targetHost, () => {
      // Build the HTTP upgrade request to forward
      const reqHeaders = sanitizeRequestHeaders(
        clientReq.headers,
        clientReq,
        targetUrl.host,
        true, // isWebSocketUpgrade — preserve the `upgrade` header
      )
      // TIM-80: Sanitize values to prevent CRLF injection
      let reqLine = `GET ${sanitizeHeaderValue(targetPath)} HTTP/1.1\r\n`
      for (const [key, value] of Object.entries(reqHeaders)) {
        if (value !== undefined) {
          const vals = Array.isArray(value) ? value : [value]
          for (const v of vals) {
            reqLine += `${sanitizeHeaderValue(key)}: ${sanitizeHeaderValue(v)}\r\n`
          }
        }
      }
      reqLine += '\r\n'

      proxySocket.write(reqLine)
      if (head && head.length > 0) {
        proxySocket.write(head)
      }

      proxySocket.pipe(clientSocket as net.Socket)
      ;(clientSocket as net.Socket).pipe(proxySocket)
    })

    proxySocket.on('error', (err) => {
      log.error(`WebSocket proxy error for target ${target}:`, err.message)
      try { (clientSocket as net.Socket).destroy() } catch { /* already destroyed */ }
    })

    ;(clientSocket as net.Socket).on('error', () => {
      try { proxySocket.destroy() } catch { /* already destroyed */ }
    })
  })

  return httpServer
}
