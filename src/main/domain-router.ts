/**
 * domain-router.ts — Lightweight HTTP reverse proxy for local custom domains.
 *
 * Listens on a non-privileged port (default 8080) and routes incoming
 * requests to the correct site server based on the Host header.
 *
 * Flow:
 *   Browser -> http://my-project.local:8080
 *     -> hosts resolves to 127.0.0.1
 *     -> domain-router receives request on port 8080
 *     -> reads Host header ("my-project.local")
 *     -> proxies to http://127.0.0.1:{site-port}
 */

import http from 'node:http'
import { createLogger } from './logger'

const log = createLogger('DomainRouter')

const DEFAULT_PORT = 8080

export type DomainResolver = (domain: string) => number | null

export class DomainRouter {
  private server: http.Server | null = null
  private port: number = DEFAULT_PORT
  private resolver: DomainResolver

  /**
   * @param resolver — A function that, given a domain name, returns the
   *   local port to proxy to, or null if the domain is unknown.
   */
  constructor(resolver: DomainResolver) {
    this.resolver = resolver
  }

  /**
   * Start the domain router on the given port.
   */
  async start(port: number = DEFAULT_PORT): Promise<number> {
    if (this.server) {
      log.info('Domain router already running, restarting...')
      await this.stop()
    }

    this.port = port

    this.server = http.createServer((req, res) => {
      this.handleRequest(req, res)
    })

    return new Promise<number>((resolve, reject) => {
      this.server!.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
          log.warn(`Port ${this.port} is in use, domain router not started`)
          reject(new Error(`Port ${this.port} 已被佔用，無法啟動本地域名路由`))
        } else {
          reject(err)
        }
      })

      this.server!.listen(this.port, '127.0.0.1', () => {
        log.info(`Domain router started on http://127.0.0.1:${this.port}`)
        resolve(this.port)
      })
    })
  }

  /**
   * Stop the domain router.
   */
  async stop(): Promise<void> {
    if (!this.server) return

    return new Promise<void>((resolve) => {
      this.server!.close(() => {
        this.server = null
        log.info('Domain router stopped')
        resolve()
      })
      // Force close after timeout
      setTimeout(() => {
        this.server = null
        resolve()
      }, 2000)
    })
  }

  /**
   * Check if the domain router is running.
   */
  isRunning(): boolean {
    return this.server !== null && this.server.listening
  }

  /**
   * Get the port the router is listening on.
   */
  getPort(): number {
    return this.port
  }

  /**
   * Update the resolver function (e.g. when domain mappings change).
   */
  updateResolver(resolver: DomainResolver): void {
    this.resolver = resolver
  }

  // --- Private ---

  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    const host = req.headers.host
    if (!host) {
      this.respondError(res, 400, '缺少 Host header')
      return
    }

    // Strip port from host header if present
    const domain = host.split(':')[0].toLowerCase()

    // Resolve domain to a local port
    const targetPort = this.resolver(domain)

    if (targetPort === null) {
      this.respondNotFound(res, domain)
      return
    }

    // Proxy the request to the target port
    this.proxyRequest(req, res, targetPort, domain)
  }

  private proxyRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    targetPort: number,
    domain: string
  ): void {
    const options: http.RequestOptions = {
      hostname: '127.0.0.1',
      port: targetPort,
      path: req.url,
      method: req.method,
      headers: {
        ...req.headers,
        // Preserve original Host header so the target server can see it
        host: req.headers.host || domain
      }
    }

    const proxyReq = http.request(options, (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 502, proxyRes.headers)
      proxyRes.pipe(res, { end: true })
    })

    proxyReq.on('error', (err) => {
      log.debug(`Proxy error for ${domain}: ${err.message}`)
      this.respondSiteDown(res, domain)
    })

    req.pipe(proxyReq, { end: true })
  }

  private respondError(res: http.ServerResponse, status: number, message: string): void {
    res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(this.errorPage(status.toString(), message))
  }

  private respondNotFound(res: http.ServerResponse, domain: string): void {
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(
      this.errorPage(
        '404 — 域名未設定',
        `域名 <code>${escapeHtml(domain)}</code> 未被 TunnelBox 管理。<br>請在 TunnelBox 中為站點設定此域名。`
      )
    )
  }

  private respondSiteDown(res: http.ServerResponse, domain: string): void {
    res.writeHead(502, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(
      this.errorPage(
        '502 — 站點未啟動',
        `域名 <code>${escapeHtml(domain)}</code> 對應的站點目前未執行中。<br>請在 TunnelBox 中啟動該站點。`
      )
    )
  }

  private errorPage(title: string, body: string): string {
    return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="utf-8">
  <title>TunnelBox — ${title}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      display: flex; align-items: center; justify-content: center;
      min-height: 100vh; margin: 0;
      background: #faf8f5; color: #2d2926;
    }
    .card {
      background: #fff; border: 1px solid #ddd8d1; border-radius: 2px;
      padding: 32px 40px; max-width: 480px; text-align: center;
      box-shadow: 0 2px 8px rgba(45,41,38,0.06);
    }
    h1 { font-size: 16px; margin: 0 0 12px; letter-spacing: -0.02em; }
    p { font-size: 13px; color: #6b6560; line-height: 1.6; margin: 0; }
    code { background: #f0edea; padding: 2px 6px; border-radius: 2px; font-size: 12px; }
    .badge { display: inline-block; font-size: 10px; font-weight: 700; letter-spacing: 0.08em;
      text-transform: uppercase; padding: 2px 8px; background: #f0edf9; color: #7c6bce;
      border: 1px solid #7c6bce; border-radius: 2px; margin-bottom: 16px; }
  </style>
</head>
<body>
  <div class="card">
    <span class="badge">TunnelBox</span>
    <h1>${title}</h1>
    <p>${body}</p>
  </div>
</body>
</html>`
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
