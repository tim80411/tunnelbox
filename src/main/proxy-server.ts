import http from 'node:http'
import net from 'node:net'
import { createLogger } from './logger'
import { acquireConnection, releaseConnection } from './rate-limiter'

const log = createLogger('ProxyServer')

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
        `<p>Cannot reach target server <code>${target}</code></p>` +
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

    const targetPath = targetBasePath + (clientReq.url || '/')

    const options: http.RequestOptions = {
      hostname: targetHost,
      port: targetPort,
      path: targetPath,
      method: clientReq.method,
      headers: {
        ...clientReq.headers,
        host: targetUrl.host
      }
    }

    const proxyReq = http.request(options, (proxyRes) => {
      httpServer.emit('proxy:success')
      clientRes.writeHead(proxyRes.statusCode || 502, proxyRes.headers)
      proxyRes.pipe(clientRes)
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
      const reqHeaders = { ...clientReq.headers, host: targetUrl.host }
      let reqLine = `${clientReq.method} ${targetPath} HTTP/1.1\r\n`
      for (const [key, value] of Object.entries(reqHeaders)) {
        if (value !== undefined) {
          const vals = Array.isArray(value) ? value : [value]
          for (const v of vals) {
            reqLine += `${key}: ${v}\r\n`
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
