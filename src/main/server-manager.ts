import http from 'node:http'
import path from 'node:path'
import fs from 'node:fs'
import handler from 'serve-handler'
import { watch, type FSWatcher } from 'chokidar'
import { WebSocketServer, type WebSocket } from 'ws'
import getPort from 'get-port'
import crypto from 'node:crypto'
import { createLogger } from './logger'
import { createProxyServer } from './proxy-server'
import { PortHealthChecker } from './port-health-checker'
import { extractPort } from '../shared/proxy-utils'
import type { StoredSite } from '../shared/types'

const log = createLogger('ServerManager')
const PORT_RANGE = Array.from({ length: 6001 }, (_, i) => 3000 + i)

/** Maximum WebSocket connections per siteId. */
const MAX_WS_PER_SITE = 100
/** Maximum total WebSocket connections across all sites. */
const MAX_WS_GLOBAL = 500

// ---------- Types ----------

interface BaseSiteServer {
  id: string
  name: string
  port: number
  status: 'running' | 'stopped' | 'error'
  httpServer?: http.Server
}

export interface StaticSiteServer extends BaseSiteServer {
  serveMode: 'static'
  folderPath: string
  watcher?: FSWatcher
}

export interface ProxySiteServer extends BaseSiteServer {
  serveMode: 'proxy'
  proxyTarget: string
  passthrough?: boolean
  passthroughPort?: number
  healthChecker?: PortHealthChecker
}

export type SiteServer = StaticSiteServer | ProxySiteServer

export type FileChangeCallback = (siteId: string) => void

// ---------- Hot Reload Script ----------

function getReloadClientScript(wsPort: number, siteId: string): string {
  return `
<script>
(function() {
  var protocol = 'ws:';
  var host = location.hostname || 'localhost';
  var wsUrl = protocol + '//' + host + ':' + ${wsPort} + '/?siteId=' + encodeURIComponent('${siteId}');
  var maxRetries = 10;
  var retryCount = 0;
  var retryDelay = 1000;

  function connect() {
    var ws = new WebSocket(wsUrl);
    ws.onmessage = function(event) {
      if (event.data === 'reload') {
        location.reload();
      }
    };
    ws.onclose = function() {
      if (retryCount < maxRetries) {
        retryCount++;
        setTimeout(connect, retryDelay);
      }
    };
    ws.onerror = function() {
      ws.close();
    };
  }
  connect();
})();
</script>
`
}

// ---------- ServerManager ----------

export type StatusChangeCallback = (siteId: string, status: 'running' | 'error') => void

const PROXY_ERROR_THRESHOLD_MS = 30_000
const MAX_WS_CONNECTIONS_PER_SITE = 100
const MAX_HTML_INJECTION_SIZE = 50 * 1024 * 1024 // 50 MB — skip reload script injection for larger responses

export class ServerManager {
  private servers: Map<string, SiteServer> = new Map()
  private fileChangeCallbacks: Set<FileChangeCallback> = new Set()
  private statusChangeCallbacks: Set<StatusChangeCallback> = new Set()
  private debounceTimers: Map<string, ReturnType<typeof setTimeout>> = new Map()
  private proxyErrorStart: Map<string, number> = new Map() // siteId -> first error timestamp

  // Global WebSocket server for all sites
  private globalWsServer: WebSocketServer | null = null
  private globalWsPort: number = 0
  private wsClients: Map<string, Set<WebSocket>> = new Map() // siteId -> connected clients

  /**
   * Initialize the global WebSocket server used for hot reload.
   * Must be called before starting any site servers.
   */
  async initWebSocket(): Promise<void> {
    this.globalWsPort = await getPort({ port: Array.from({ length: 100 }, (_, i) => 9100 + i) })

    this.globalWsServer = new WebSocketServer({ host: '127.0.0.1', port: this.globalWsPort })

    this.globalWsServer.on('connection', (ws, req) => {
      // Validate Origin header — accept only localhost origins
      const origin = req.headers.origin
      if (origin) {
        try {
          const originUrl = new URL(origin)
          const hostname = originUrl.hostname
          if (hostname !== 'localhost' && hostname !== '127.0.0.1' && hostname !== '::1') {
            log.warn(`WebSocket connection rejected: non-localhost Origin "${origin}"`)
            ws.close(1008, 'Forbidden: non-localhost origin')
            return
          }
        } catch {
          log.warn(`WebSocket connection rejected: invalid Origin "${origin}"`)
          ws.close(1008, 'Forbidden: invalid origin')
          return
        }
      }

      // Enforce global WebSocket connection limit
      const totalConnections = this.getTotalWsConnectionCount()
      if (totalConnections >= MAX_WS_GLOBAL) {
        log.warn(`Global WebSocket limit reached (${MAX_WS_GLOBAL}), rejecting connection`)
        ws.close(1013, 'Try Again Later – global connection limit reached')
        return
      }

      const url = new URL(req.url || '/', `http://localhost:${this.globalWsPort}`)
      const siteId = url.searchParams.get('siteId') || ''

      // Enforce per-site connection limit
      if (!this.wsClients.has(siteId)) {
        this.wsClients.set(siteId, new Set())
      }
      const clients = this.wsClients.get(siteId)!
      if (clients.size >= MAX_WS_CONNECTIONS_PER_SITE) {
        log.warn(`WebSocket connection rejected: site "${siteId}" reached limit of ${MAX_WS_CONNECTIONS_PER_SITE} connections`)
        ws.close(1013, 'Too many connections')
        return
      }
      clients.add(ws)

      ws.on('close', () => {
        this.wsClients.get(siteId)?.delete(ws)
      })

      ws.on('error', () => {
        this.wsClients.get(siteId)?.delete(ws)
      })
    })

    this.globalWsServer.on('error', (err) => {
      log.error('WebSocket server error:', err)
    })

    log.info(`Global WebSocket server started on port ${this.globalWsPort}`)
  }

  /**
   * Start an HTTP server for the given site. Dispatches to static or proxy mode.
   */
  async startServer(site: StoredSite): Promise<SiteServer> {
    // If the server already exists and is running, stop it first (restart scenario)
    const existing = this.servers.get(site.id)
    if (existing && existing.status !== 'stopped') {
      await this.stopServer(site.id)
    }

    if (site.serveMode === 'proxy') {
      if (site.passthrough) {
        return this.startPassthroughServer(site)
      }
      return this.startProxyServer(site)
    }
    return this.startStaticServer(site)
  }

  // ---------- Private: Static Server ----------

  private async startStaticServer(site: { id: string; name: string; serveMode: 'static'; folderPath: string; directoryListing?: boolean }): Promise<StaticSiteServer> {
    // Validate folder exists and is readable
    try {
      const stat = fs.statSync(site.folderPath)
      if (!stat.isDirectory()) {
        throw new Error(`請選擇資料夾，而非檔案`)
      }
      fs.accessSync(site.folderPath, fs.constants.R_OK)
    } catch (err) {
      if (err instanceof Error && err.message === '請選擇資料夾，而非檔案') {
        throw err
      }
      throw new Error(`無法存取資料夾：${site.folderPath}。路徑不存在或權限不足`)
    }

    const port = await this.allocatePort()
    const wsPort = this.globalWsPort

    // Create HTTP server with serve-handler, injecting hot reload script into HTML responses
    const httpServer = http.createServer((req, res) => {
      // Prevent browser caching — different sites may reuse the same port
      res.setHeader('Cache-Control', 'no-store')

      // Intercept HTML responses to inject reload script
      const originalWriteHead = res.writeHead.bind(res)
      const originalEnd = res.end.bind(res)
      let isHtml = false
      let chunks: Buffer[] = []
      let bufferSize = 0
      let bufferOverflow = false

      res.writeHead = function (
        statusCode: number,
        ...args: unknown[]
      ): http.ServerResponse {
        // Detect if this is an HTML response
        const headers =
          args.length === 2 ? (args[1] as http.OutgoingHttpHeaders) : (args[0] as http.OutgoingHttpHeaders | undefined)

        if (headers) {
          // Enforce no-store even if serve-handler sets its own Cache-Control
          headers['Cache-Control'] = 'no-store'

          const ct = headers['content-type'] || headers['Content-Type']
          if (typeof ct === 'string' && ct.includes('text/html')) {
            isHtml = true
            // Remove content-length since we'll modify the body
            delete headers['content-length']
            delete headers['Content-Length']
          }
        }

        if (args.length === 2) {
          return originalWriteHead(statusCode, args[0] as string, args[1] as http.OutgoingHttpHeaders)
        }
        return originalWriteHead(statusCode, args[0] as http.OutgoingHttpHeaders)
      } as typeof res.writeHead

      const originalWrite = res.write.bind(res)
      res.write = function (
        chunk: unknown,
        ...args: unknown[]
      ): boolean {
        if (isHtml && !bufferOverflow) {
          const buf = Buffer.isBuffer(chunk) ? chunk : typeof chunk === 'string' ? Buffer.from(chunk) : null
          if (buf) {
            bufferSize += buf.length
            if (bufferSize > MAX_HTML_INJECTION_SIZE) {
              // Buffer limit exceeded — flush accumulated chunks and switch to passthrough
              log.warn(`HTML response for "${site.name}" exceeds ${MAX_HTML_INJECTION_SIZE} bytes, skipping reload script injection`)
              bufferOverflow = true
              for (const buffered of chunks) {
                (originalWrite as (...a: unknown[]) => boolean)(buffered)
              }
              chunks = []
              return (originalWrite as (...a: unknown[]) => boolean)(buf)
            }
            chunks.push(buf)
          }
          return true
        }
        return (originalWrite as (...a: unknown[]) => boolean)(chunk, ...args)
      } as typeof res.write

      res.end = function (...args: unknown[]): http.ServerResponse {
        if (isHtml && !bufferOverflow) {
          if (args[0]) {
            const buf = Buffer.isBuffer(args[0]) ? args[0] : typeof args[0] === 'string' ? Buffer.from(args[0]) : null
            if (buf) {
              bufferSize += buf.length
              if (bufferSize > MAX_HTML_INJECTION_SIZE) {
                log.warn(`HTML response for "${site.name}" exceeds ${MAX_HTML_INJECTION_SIZE} bytes, skipping reload script injection`)
                for (const buffered of chunks) {
                  (originalWrite as (...a: unknown[]) => boolean)(buffered)
                }
                return (originalEnd as (...a: unknown[]) => http.ServerResponse)(buf)
              }
              chunks.push(buf)
            }
          }
          let body = Buffer.concat(chunks).toString('utf-8')
          const script = getReloadClientScript(wsPort, site.id)

          // Inject before </body> or at end
          if (body.includes('</body>')) {
            body = body.replace('</body>', `${script}</body>`)
          } else if (body.includes('</html>')) {
            body = body.replace('</html>', `${script}</html>`)
          } else {
            body = body + script
          }

          return originalEnd(body) as http.ServerResponse
        }
        return (originalEnd as (...a: unknown[]) => http.ServerResponse)(...args)
      } as typeof res.end

      // Serve .html files directly to avoid serve-handler's cleanUrls redirect
      // (which breaks iframe-based sites by redirecting .html to clean URLs).
      // Uses writeHead so the hot reload script injection interceptor activates.
      if (req.url) {
        const decoded = decodeURIComponent(req.url.split('?')[0])
        if (decoded.endsWith('.html')) {
          const filePath = path.join(site.folderPath, decoded)
          if (fs.existsSync(filePath)) {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
            fs.createReadStream(filePath).pipe(res)
            return
          }
        }
      }

      handler(req, res, {
        public: site.folderPath,
        directoryListing: site.directoryListing === true
      })
    })

    // Start listening on all interfaces (0.0.0.0) so LAN devices can access
    await this.listenOnPort(httpServer, port)

    // Start file watcher
    const watcher = this.createWatcher(site.id, site.folderPath)

    const siteServer: StaticSiteServer = {
      id: site.id,
      name: site.name,
      serveMode: 'static',
      folderPath: site.folderPath,
      port,
      status: 'running',
      httpServer,
      watcher
    }

    this.servers.set(site.id, siteServer)
    log.info(`Static server for "${site.name}" started on http://localhost:${port}`)

    return siteServer
  }

  // ---------- Private: Proxy Server ----------

  private async startProxyServer(site: { id: string; name: string; serveMode: 'proxy'; proxyTarget: string }): Promise<ProxySiteServer> {
    const port = await this.allocatePort()

    const httpServer = createProxyServer(site.proxyTarget)

    // Track proxy target health for status updates
    httpServer.on('proxy:error', () => {
      if (!this.proxyErrorStart.has(site.id)) {
        this.proxyErrorStart.set(site.id, Date.now())
      }
      const errorStart = this.proxyErrorStart.get(site.id)!
      const server = this.servers.get(site.id)
      if (server && server.status === 'running' && Date.now() - errorStart >= PROXY_ERROR_THRESHOLD_MS) {
        server.status = 'error'
        log.warn(`Proxy target for "${site.name}" unreachable for >30s, status → error`)
        this.notifyStatusChange(site.id, 'error')
      }
    })

    httpServer.on('proxy:success', () => {
      this.proxyErrorStart.delete(site.id)
      const server = this.servers.get(site.id)
      if (server && server.status === 'error') {
        server.status = 'running'
        log.info(`Proxy target for "${site.name}" recovered, status → running`)
        this.notifyStatusChange(site.id, 'running')
      }
    })

    // Start listening
    await this.listenOnPort(httpServer, port)

    const siteServer: ProxySiteServer = {
      id: site.id,
      name: site.name,
      serveMode: 'proxy',
      proxyTarget: site.proxyTarget,
      port,
      status: 'running',
      httpServer
    }

    this.servers.set(site.id, siteServer)
    log.info(`Proxy server for "${site.name}" started on http://localhost:${port} -> ${site.proxyTarget}`)

    return siteServer
  }

  // ---------- Private: Passthrough Server ----------

  private startPassthroughServer(site: {
    id: string; name: string; serveMode: 'proxy'; proxyTarget: string;
    passthrough?: boolean; passthroughPort?: number
  }): ProxySiteServer {
    const targetPort = site.passthroughPort ?? extractPort(site.proxyTarget)

    const siteServer: ProxySiteServer = {
      id: site.id,
      name: site.name,
      serveMode: 'proxy',
      proxyTarget: site.proxyTarget,
      passthrough: true,
      passthroughPort: targetPort,
      port: targetPort, // tunnel points directly at user's port
      status: 'running' // optimistic; first probe may flip to error
    }

    this.servers.set(site.id, siteServer)

    // Start TCP health checking
    const checker = new PortHealthChecker(targetPort)
    siteServer.healthChecker = checker

    checker.start(
      () => {
        // Port became reachable
        const server = this.servers.get(site.id)
        if (server && server.status !== 'running') {
          server.status = 'running'
          log.info(`Passthrough target for "${site.name}" recovered, status → running`)
          this.notifyStatusChange(site.id, 'running')
        }
      },
      () => {
        // Port became unreachable
        const server = this.servers.get(site.id)
        if (server && server.status !== 'error') {
          server.status = 'error'
          log.warn(`Passthrough target for "${site.name}" unreachable, status → error`)
          this.notifyStatusChange(site.id, 'error')
        }
      }
    )

    log.info(`Passthrough registered for "${site.name}" tracking port ${targetPort}`)
    return siteServer
  }

  /**
   * Stop a server by id.
   */
  async stopServer(id: string): Promise<void> {
    const server = this.servers.get(id)
    if (!server) return

    // Close HTTP server
    if (server.httpServer) {
      await new Promise<void>((resolve) => {
        server.httpServer!.close(() => resolve())
        // Force close all connections after a timeout
        setTimeout(() => resolve(), 2000)
      })
      server.httpServer = undefined
    }

    // Close file watcher (static sites only)
    if (server.serveMode === 'static' && server.watcher) {
      await server.watcher.close()
      server.watcher = undefined
    }

    // Stop port health checker (passthrough sites)
    if (server.serveMode === 'proxy' && server.healthChecker) {
      server.healthChecker.stop()
      server.healthChecker = undefined
    }

    // Clear proxy error tracking
    this.proxyErrorStart.delete(id)

    // Clear debounce timer
    const timer = this.debounceTimers.get(id)
    if (timer) {
      clearTimeout(timer)
      this.debounceTimers.delete(id)
    }

    // Close WebSocket connections for this site
    const clients = this.wsClients.get(id)
    if (clients) {
      for (const ws of clients) {
        ws.close()
      }
      this.wsClients.delete(id)
    }

    server.status = 'stopped'
    server.port = 0
    log.info(`Server "${server.name}" stopped`)
  }

  /**
   * Stop all servers and clean up.
   */
  async stopAll(): Promise<void> {
    const stopPromises = Array.from(this.servers.keys()).map((id) => this.stopServer(id))
    await Promise.allSettled(stopPromises)

    // Close global WebSocket server
    if (this.globalWsServer) {
      this.globalWsServer.close()
      this.globalWsServer = null
    }

    log.info('All servers stopped')
  }

  /**
   * Remove a server entry entirely.
   */
  async removeServer(id: string): Promise<void> {
    await this.stopServer(id)
    this.servers.delete(id)
  }

  /**
   * Get all servers as serializable SiteInfo array.
   */
  getServers(): SiteServer[] {
    return Array.from(this.servers.values())
  }

  /**
   * Get a server by id.
   */
  getServer(id: string): SiteServer | undefined {
    return this.servers.get(id)
  }

  /**
   * Register a stopped server entry (from store) without starting it.
   */
  registerStopped(site: StoredSite): void {
    if (site.serveMode === 'proxy') {
      this.servers.set(site.id, {
        id: site.id,
        name: site.name,
        serveMode: 'proxy',
        proxyTarget: site.proxyTarget,
        ...(site.passthrough && { passthrough: true, passthroughPort: site.passthroughPort }),
        port: 0,
        status: 'stopped'
      })
    } else {
      this.servers.set(site.id, {
        id: site.id,
        name: site.name,
        serveMode: 'static',
        folderPath: site.folderPath,
        port: 0,
        status: 'stopped'
      })
    }
  }

  /**
   * Register a callback for proxy status changes (error / recovery).
   */
  onStatusChange(callback: StatusChangeCallback): () => void {
    this.statusChangeCallbacks.add(callback)
    return () => { this.statusChangeCallbacks.delete(callback) }
  }

  /**
   * Register a callback to be called when files change for any site.
   */
  onFileChange(callback: FileChangeCallback): () => void {
    this.fileChangeCallbacks.add(callback)
    return () => {
      this.fileChangeCallbacks.delete(callback)
    }
  }

  /**
   * Generate a unique site id.
   */
  generateId(): string {
    return crypto.randomUUID()
  }

  /** Count total WebSocket connections across all sites. */
  private getTotalWsConnectionCount(): number {
    let total = 0
    for (const clients of this.wsClients.values()) {
      total += clients.size
    }
    return total
  }

  // ---------- Private: Shared Helpers ----------

  private async allocatePort(): Promise<number> {
    let port: number
    try {
      port = await getPort({ port: PORT_RANGE })
    } catch {
      throw new Error('無可用的 Port（範圍 3000-9000 皆被佔用）')
    }

    if (port < 3000 || port > 9000) {
      throw new Error('無可用的 Port（範圍 3000-9000 皆被佔用）')
    }

    return port
  }

  private async listenOnPort(httpServer: http.Server, port: number): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const onError = (err: Error): void => {
        reject(new Error(`伺服器啟動失敗（Port ${port}）：${err.message}`))
      }
      httpServer.once('error', onError)
      httpServer.listen(port, '0.0.0.0', () => {
        httpServer.removeListener('error', onError)
        resolve()
      })
    })
  }

  private createWatcher(siteId: string, folderPath: string): FSWatcher {
    const watcher = watch(folderPath, {
      persistent: true,
      ignoreInitial: true,
      depth: undefined // recursive: watch all subdirectories
    })

    const handleChange = (): void => {
      // Debounce: 500ms after last change
      const existingTimer = this.debounceTimers.get(siteId)
      if (existingTimer) {
        clearTimeout(existingTimer)
      }

      const timer = setTimeout(() => {
        this.debounceTimers.delete(siteId)
        this.notifyFileChange(siteId)
      }, 500)

      this.debounceTimers.set(siteId, timer)
    }

    watcher.on('change', handleChange)
    watcher.on('add', handleChange)
    watcher.on('unlink', handleChange)
    watcher.on('addDir', handleChange)
    watcher.on('unlinkDir', handleChange)

    watcher.on('error', (err) => {
      log.error(`Watcher error for site ${siteId}:`, err)
      // Stop the watcher on error but don't crash
      watcher.close().catch(() => {})
      const server = this.servers.get(siteId)
      if (server && server.serveMode === 'static') {
        server.watcher = undefined
      }
    })

    return watcher
  }

  private notifyStatusChange(siteId: string, status: 'running' | 'error'): void {
    for (const cb of this.statusChangeCallbacks) {
      try {
        cb(siteId, status)
      } catch (err) {
        log.error('Status change callback error:', err)
      }
    }
  }

  private notifyFileChange(siteId: string): void {
    // Notify all registered callbacks
    for (const cb of this.fileChangeCallbacks) {
      try {
        cb(siteId)
      } catch (err) {
        log.error('File change callback error:', err)
      }
    }

    // Notify WebSocket clients for this site to reload
    const clients = this.wsClients.get(siteId)
    if (clients) {
      for (const ws of clients) {
        try {
          if (ws.readyState === ws.OPEN) {
            ws.send('reload')
          }
        } catch (err) {
          log.error('WebSocket send error:', err)
        }
      }
    }
  }
}
