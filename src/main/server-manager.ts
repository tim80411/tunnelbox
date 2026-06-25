import http from 'node:http'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import handler from 'serve-handler'
import { watch, type FSWatcher } from 'chokidar'
import { WebSocketServer, type WebSocket } from 'ws'
import getPort from 'get-port'
import crypto from 'node:crypto'
import { createLogger } from './logger'
import { createProxyServer } from './proxy-server'
import { PortHealthChecker } from './port-health-checker'
import { extractPort } from '../shared/proxy-utils'
import { visitorTracker } from './visitor-tracker'
import { getSettings } from './settings-store'
import { handleConsoleMessage } from './remote-console'
import { addEntry, clearEntries } from './request-logger'
import { resolveWithinRoot, isHostAllowed, isWsUpgradeAllowed, isSensitiveServePath, DEFAULT_WATCH_IGNORES } from './server-security'
import type { StoredSite } from '../shared/types'

const log = createLogger('ServerManager')
const PORT_RANGE = Array.from({ length: 6001 }, (_, i) => 3000 + i)

/** Maximum total WebSocket connections across all sites. */
const MAX_WS_GLOBAL = 500

// ---------- Types ----------

interface BaseSiteServer {
  id: string
  name: string
  port: number
  status: 'running' | 'stopped' | 'error'
  httpServer?: http.Server
  wsServer?: WebSocketServer
  /**
   * TIM-225: per-site LAN sharing. true → bound to 0.0.0.0 (LAN-reachable),
   * false/undefined → bound to 127.0.0.1 (localhost-only, the secure default).
   * Held in memory so the Host guard can consult it per-request without a
   * disk read, and so setSiteLanMode can rebind on the same port.
   */
  lanMode?: boolean
}

export interface StaticSiteServer extends BaseSiteServer {
  serveMode: 'static'
  folderPath: string
  watcher?: FSWatcher
  /** Per-site custom watch-ignore globs (in addition to the defaults). TIM-229 */
  ignore?: string[]
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

function getReloadClientScript(siteId: string): string {
  const settings = getSettings()
  const consoleForwarding = settings.remoteConsoleEnabled

  let consoleScript = ''
  if (consoleForwarding) {
    consoleScript = `
  // --- Console Forwarding ---
  var _tbSessionId = Math.random().toString(36).slice(2);
  var _tbOrigLog = console.log;
  var _tbOrigWarn = console.warn;
  var _tbOrigError = console.error;
  var _tbQueue = [];
  var _tbSending = false;

  function _tbSend(level, args) {
    var payload = JSON.stringify({
      type: 'console',
      level: level,
      args: Array.prototype.slice.call(args).map(function(a) {
        try {
          if (a instanceof Error) return { __error: true, message: a.message, stack: a.stack };
          return JSON.parse(JSON.stringify(a));
        } catch(e) { return String(a); }
      }),
      timestamp: Date.now(),
      sessionId: _tbSessionId
    });
    _tbQueue.push(payload);
    _tbFlush();
  }

  function _tbFlush() {
    if (_tbSending || _tbQueue.length === 0) return;
    _tbSending = true;
    setTimeout(function() {
      var batch = _tbQueue.splice(0, 20);
      for (var i = 0; i < batch.length; i++) {
        try { if (_tbWs && _tbWs.readyState === 1) _tbWs.send(batch[i]); } catch(e) {}
      }
      _tbSending = false;
      if (_tbQueue.length > 0) _tbFlush();
    }, 50);
  }

  console.log = function() { _tbOrigLog.apply(console, arguments); _tbSend('log', arguments); };
  console.warn = function() { _tbOrigWarn.apply(console, arguments); _tbSend('warn', arguments); };
  console.error = function() { _tbOrigError.apply(console, arguments); _tbSend('error', arguments); };`
  }

  return `
<script>
(function() {
  var protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  var wsUrl = protocol + '//' + location.host + '/__tb_ws?siteId=' + encodeURIComponent('${siteId}');
  var maxRetries = 10;
  var retryCount = 0;
  var retryDelay = 1000;
  var _tbWs = null;
${consoleScript}
  function connect() {
    var ws = new WebSocket(wsUrl);
    _tbWs = ws;
    ws.onmessage = function(event) {
      if (event.data === 'reload') {
        location.reload();
      }
    };
    ws.onclose = function() {
      _tbWs = null;
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
  private wsClients: Map<string, Set<WebSocket>> = new Map() // siteId -> connected clients
  // TIM-225: per-site public hostnames allowed past the Host-header guard.
  private allowedTunnelHosts: Map<string, Set<string>> = new Map() // siteId -> hostnames (lowercased)
  private localIpsCache: { ips: Set<string>; at: number } | null = null
  // TIM-224: watcher health monitoring.
  private watcherHealthTimer?: ReturnType<typeof setInterval>
  private watcherUnhealthyCallbacks: Set<(siteId: string) => void> = new Set()

  /**
   * Attach a WebSocket server to an HTTP server for hot reload and console forwarding.
   * WS connections use the same port as the HTTP server via upgrade handling.
   */
  private attachWebSocket(httpServer: http.Server, siteId: string): WebSocketServer {
    const wss = new WebSocketServer({ noServer: true })

    httpServer.on('upgrade', (req, socket, head) => {
      // Only handle our custom path
      const url = new URL(req.url || '/', `http://localhost`)
      if (url.pathname !== '/__tb_ws') {
        socket.destroy()
        return
      }

      // TIM-311: apply the same DNS-rebinding guard as the HTTP path, plus
      // Origin validation (CSWSH). The WS upgrade shared this port with no
      // guard, so a forged-Host / cross-origin upgrade could connect where an
      // equivalent HTTP GET is 403'd. Read lanMode live from the server entry
      // so a setSiteLanMode rebind is reflected immediately (mirrors the HTTP
      // handler in startStaticServer).
      const lanEnabled = this.servers.get(siteId)?.lanMode ?? false
      if (
        !isWsUpgradeAllowed(
          { host: req.headers.host, origin: req.headers.origin },
          {
            localIps: this.getLocalIps(),
            tunnelHosts: this.allowedTunnelHosts.get(siteId) ?? new Set(),
            lanEnabled
          }
        )
      ) {
        log.warn(
          `WS upgrade rejected for site "${siteId}": host=${req.headers.host ?? '(none)'} origin=${req.headers.origin ?? '(none)'}`
        )
        socket.destroy()
        return
      }

      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req)
      })
    })

    wss.on('connection', (ws) => {
      // Enforce global WebSocket connection limit
      const totalConnections = this.getTotalWsConnectionCount()
      if (totalConnections >= MAX_WS_GLOBAL) {
        log.warn(`Global WebSocket limit reached (${MAX_WS_GLOBAL}), rejecting connection`)
        ws.close(1013, 'Try Again Later – global connection limit reached')
        return
      }

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

      // Handle console forwarding messages
      ws.on('message', (rawData) => {
        try {
          const data = typeof rawData === 'string' ? rawData : rawData.toString()
          handleConsoleMessage(data, siteId)
        } catch (err) {
          log.error('Error processing WS message:', err)
        }
      })

      ws.on('close', () => {
        this.wsClients.get(siteId)?.delete(ws)
      })

      ws.on('error', () => {
        this.wsClients.get(siteId)?.delete(ws)
      })
    })

    wss.on('error', (err) => {
      log.error(`WebSocket server error for site ${siteId}:`, err)
    })

    return wss
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

  private async startStaticServer(site: { id: string; name: string; serveMode: 'static'; folderPath: string; directoryListing?: boolean; ignore?: string[]; lanMode?: boolean }): Promise<StaticSiteServer> {
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

    // Create HTTP server with serve-handler, injecting hot reload script into HTML responses
    const httpServer = http.createServer((req, res) => {
      // TIM-225: DNS-rebinding guard. Reject requests whose Host header is not
      // one we expect to serve (localhost / a registered tunnel host, plus LAN
      // IPs only when LAN sharing is on). Read lanMode live from the server
      // entry so a setSiteLanMode rebind is reflected immediately.
      const lanEnabled = this.servers.get(site.id)?.lanMode ?? site.lanMode === true
      if (!isHostAllowed(req.headers.host, {
        localIps: this.getLocalIps(),
        tunnelHosts: this.allowedTunnelHosts.get(site.id) ?? new Set(),
        lanEnabled
      })) {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' })
        res.end('Forbidden: unrecognized Host header')
        return
      }

      // TIM-314 (F13): serve-handler has no dotfile filter, so block requests
      // for sensitive dotfiles/dirs (.env, .git, .ssh, .htpasswd, …) before
      // they reach it — answer 404 so the file's existence isn't revealed.
      if (isSensitiveServePath(req.url || '/')) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
        res.end('Not Found')
        return
      }

      // Prevent browser caching — different sites may reuse the same port
      res.setHeader('Cache-Control', 'no-store')

      // Track visitor if request comes through tunnel
      visitorTracker.trackRequest(req, site.id, site.name)

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
          const script = getReloadClientScript(site.id)

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
          // TIM-225: this custom fast-path bypasses serve-handler's own
          // traversal protection, so resolve safely within the site root.
          const filePath = resolveWithinRoot(site.folderPath, decoded)
          if (filePath === null) {
            res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' })
            res.end('Forbidden: path traversal')
            return
          }
          if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
            // resolveWithinRoot is purely string-based, so a symlink inside the
            // folder could still point outside it. Resolve real paths and
            // re-check containment before streaming. (TIM-225, symlink escape)
            try {
              const realFile = fs.realpathSync(filePath)
              const realRoot = fs.realpathSync(site.folderPath)
              if (realFile !== realRoot && !realFile.startsWith(realRoot + path.sep)) {
                res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' })
                res.end('Forbidden: path traversal')
                return
              }
              res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
              fs.createReadStream(realFile).pipe(res)
              return
            } catch {
              // realpath failed (race / vanished) — fall through to serve-handler
            }
          }
        }
      }

      handler(req, res, {
        public: site.folderPath,
        directoryListing: site.directoryListing === true
      })
    })

    // Attach WebSocket server on the same port via upgrade handling
    const wsServer = this.attachWebSocket(httpServer, site.id)

    // TIM-225: bind to LAN (0.0.0.0) only when this site opted in; otherwise
    // localhost-only (127.0.0.1), the secure default.
    const lanMode = site.lanMode === true
    await this.listenOnPort(httpServer, port, lanMode)

    // Start file watcher
    const watcher = this.createWatcher(site.id, site.folderPath, site.ignore)

    const siteServer: StaticSiteServer = {
      id: site.id,
      name: site.name,
      serveMode: 'static',
      folderPath: site.folderPath,
      port,
      status: 'running',
      httpServer,
      wsServer,
      watcher,
      ignore: site.ignore,
      lanMode
    }

    this.servers.set(site.id, siteServer)
    // TIM-224: ensure the watcher health monitor is running.
    this.startWatcherHealthMonitor()
    log.info(`Static server for "${site.name}" started on http://localhost:${port}`)

    return siteServer
  }

  // ---------- Private: Proxy Server ----------

  private async startProxyServer(site: { id: string; name: string; serveMode: 'proxy'; proxyTarget: string; lanMode?: boolean }): Promise<ProxySiteServer> {
    const port = await this.allocatePort()

    // TIM-315: guard the proxy path with the same DNS-rebinding allowlist as
    // the static server. lanMode is read live so a setSiteLanMode rebind applies.
    const httpServer = createProxyServer(site.proxyTarget, {
      isHostAllowed: (host) =>
        isHostAllowed(host, {
          localIps: this.getLocalIps(),
          tunnelHosts: this.allowedTunnelHosts.get(site.id) ?? new Set(),
          lanEnabled: this.servers.get(site.id)?.lanMode ?? site.lanMode === true
        })
    })

    // Track visitor if request comes through tunnel
    httpServer.on('request', (req: http.IncomingMessage) => {
      visitorTracker.trackRequest(req, site.id, site.name)
    })

    // Log completed proxy requests
    httpServer.on('proxy:request-complete', (data: {
      method: string; path: string; statusCode: number; duration: number;
      requestHeaders: Record<string, string | string[] | undefined>;
      responseHeaders: Record<string, string | string[] | undefined>;
      requestBody: string | null; requestBodySize: number; requestBodyTruncated: boolean;
    }) => {
      addEntry({
        siteId: site.id,
        timestamp: Date.now(),
        ...data,
      })
    })

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

    // Start listening — TIM-225: localhost-only unless LAN sharing opted in.
    const lanMode = site.lanMode === true
    await this.listenOnPort(httpServer, port, lanMode)

    const siteServer: ProxySiteServer = {
      id: site.id,
      name: site.name,
      serveMode: 'proxy',
      proxyTarget: site.proxyTarget,
      port,
      status: 'running',
      httpServer,
      lanMode
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

    // Close WebSocket server
    if (server.wsServer) {
      server.wsServer.close()
      server.wsServer = undefined
    }

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

    // Clear request log for proxy sites
    const stoppedServer = this.servers.get(id)
    if (stoppedServer && stoppedServer.serveMode === 'proxy') {
      clearEntries(id)
    }

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
    this.stopWatcherHealthMonitor()
    const stopPromises = Array.from(this.servers.keys()).map((id) => this.stopServer(id))
    await Promise.allSettled(stopPromises)
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
   * TIM-224: register a callback fired when a static site's file watcher is
   * detected unhealthy and restarted (so the renderer can surface "live reload
   * stopped" + a manual-restart affordance).
   */
  onWatcherUnhealthy(callback: (siteId: string) => void): () => void {
    this.watcherUnhealthyCallbacks.add(callback)
    return () => {
      this.watcherUnhealthyCallbacks.delete(callback)
    }
  }

  /**
   * TIM-225: register a public hostname (e.g. a tunnel's trycloudflare /
   * custom domain) as allowed past the Host-header guard for this site.
   * Called when a tunnel starts; cleared on stop.
   */
  registerTunnelHost(siteId: string, hostname: string): void {
    if (!hostname) return
    const host = hostname.toLowerCase()
    let set = this.allowedTunnelHosts.get(siteId)
    if (!set) {
      set = new Set<string>()
      this.allowedTunnelHosts.set(siteId, set)
    }
    set.add(host)
  }

  /** TIM-225: drop all registered tunnel hostnames for a site (tunnel stopped). */
  unregisterTunnelHost(siteId: string): void {
    this.allowedTunnelHosts.delete(siteId)
  }

  /**
   * TIM-225: toggle a site's LAN sharing at runtime. Rebinds the *same*
   * httpServer on the *same* port to a new interface (127.0.0.1 ↔ 0.0.0.0),
   * so an active tunnel — which dials 127.0.0.1:port — is never orphaned, and
   * updates server.lanMode so the Host guard reflects the new policy on the
   * next request. Static + proxy servers both rebind; passthrough has no
   * server of ours to bind, so only the flag is recorded.
   */
  async setSiteLanMode(siteId: string, enabled: boolean): Promise<void> {
    const server = this.servers.get(siteId)
    if (!server) return
    // Record the desired policy regardless of running state (a later start
    // reads lanMode from the store, but keeping the in-memory entry in sync
    // avoids a stale Host-guard read if the server is mid-lifecycle).
    server.lanMode = enabled

    // Passthrough points the tunnel straight at the user's port — we never
    // bound a socket, so there's nothing to rebind.
    if (server.serveMode === 'proxy' && server.passthrough) return
    if (server.status !== 'running' || !server.httpServer) return

    const httpServer = server.httpServer
    const port = server.port

    // Release the listening socket promptly: drop hot-reload WS clients and
    // force-close lingering keep-alive connections so close() can complete
    // (otherwise idle connections keep the old bind alive and re-listen on the
    // same port would EADDRINUSE).
    const clients = this.wsClients.get(siteId)
    if (clients) {
      for (const ws of clients) ws.close()
    }
    await new Promise<void>((resolve) => {
      httpServer.close(() => resolve())
      ;(httpServer as http.Server & { closeAllConnections?: () => void }).closeAllConnections?.()
      // Safety net mirroring stopServer(): never hang the toggle.
      setTimeout(() => resolve(), 2000)
    })

    // Re-listen on the SAME port with the new interface. The request/upgrade
    // handlers stay attached to this httpServer instance, so hot reload and the
    // Host guard keep working; clients reconnect via their built-in retry.
    await this.listenOnPort(httpServer, port, enabled)
    log.info(
      `Site "${server.name}" LAN sharing ${enabled ? 'enabled (bind 0.0.0.0)' : 'disabled (bind 127.0.0.1)'}, rebound on port ${port}`
    )
  }

  /**
   * TIM-224: manually restart a static site's file watcher (renderer-driven
   * recovery). No-op for non-static or stopped sites.
   */
  restartWatcher(siteId: string, ignore?: string[]): boolean {
    const server = this.servers.get(siteId)
    if (!server || server.serveMode !== 'static' || server.status !== 'running') return false
    if (!fs.existsSync(server.folderPath)) return false
    if (ignore !== undefined) server.ignore = ignore
    void server.watcher?.close().catch(() => {})
    server.watcher = this.createWatcher(server.id, server.folderPath, server.ignore)
    log.info(`Watcher for "${server.name}" restarted`)
    return true
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

  /**
   * Bind an HTTP server to a port. TIM-225: the interface depends on the site's
   * LAN mode — `0.0.0.0` (all interfaces, LAN-reachable) only when LAN sharing
   * is on; otherwise `127.0.0.1` (loopback-only). Tunnels are unaffected either
   * way since cloudflared dials `127.0.0.1:port`, which loopback always serves.
   */
  private async listenOnPort(httpServer: http.Server, port: number, lanMode: boolean): Promise<void> {
    const host = lanMode ? '0.0.0.0' : '127.0.0.1'
    await new Promise<void>((resolve, reject) => {
      const onError = (err: Error): void => {
        reject(new Error(`伺服器啟動失敗（Port ${port}）：${err.message}`))
      }
      httpServer.once('error', onError)
      httpServer.listen(port, host, () => {
        httpServer.removeListener('error', onError)
        resolve()
      })
    })
  }

  private createWatcher(siteId: string, folderPath: string, ignore?: string[]): FSWatcher {
    const watcher = watch(folderPath, {
      persistent: true,
      ignoreInitial: true,
      depth: undefined, // recursive: watch all subdirectories
      // TIM-229: skip dev folders that would thrash the watcher, plus any
      // per-site custom ignore globs.
      ignored: [...DEFAULT_WATCH_IGNORES, ...(ignore ?? [])]
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
      // TIM-224: surface immediately; the heartbeat will restart it within one
      // interval (the cadence doubles as natural backoff against error loops).
      this.notifyWatcherUnhealthy(siteId)
    })

    return watcher
  }

  /**
   * The machine's own IP addresses (loopback + LAN), lowercased. Cached for
   * 30s since it's consulted on every static request (TIM-225 Host guard).
   */
  private getLocalIps(): Set<string> {
    const now = Date.now()
    if (this.localIpsCache && now - this.localIpsCache.at < 30_000) {
      return this.localIpsCache.ips
    }
    const ips = new Set<string>()
    for (const list of Object.values(os.networkInterfaces())) {
      for (const ni of list ?? []) {
        ips.add(ni.address.toLowerCase())
      }
    }
    this.localIpsCache = { ips, at: now }
    return ips
  }

  // ---------- TIM-224: Watcher Health Monitor ----------

  private static readonly WATCHER_HEARTBEAT_MS = 60_000

  private startWatcherHealthMonitor(): void {
    if (this.watcherHealthTimer) return
    this.watcherHealthTimer = setInterval(() => {
      this.checkWatcherHealth()
    }, ServerManager.WATCHER_HEARTBEAT_MS)
    // Don't keep the event loop alive solely for the heartbeat.
    this.watcherHealthTimer.unref?.()
  }

  private stopWatcherHealthMonitor(): void {
    if (this.watcherHealthTimer) {
      clearInterval(this.watcherHealthTimer)
      this.watcherHealthTimer = undefined
    }
  }

  /**
   * Detect silently-dead watchers (chokidar emitted 'error' and we nulled it,
   * or its handle closed) for running static sites whose folder still exists,
   * then restart + notify. This reliably catches the error→null path and
   * explicit close; it cannot guarantee detection of every conceivable
   * OS-level silent death, but covers the documented "no recovery after
   * watcher error" gap.
   */
  private checkWatcherHealth(): void {
    for (const server of this.servers.values()) {
      if (server.serveMode !== 'static' || server.status !== 'running') continue
      // A vanished folder is a separate failure mode — skip (don't thrash).
      if (!fs.existsSync(server.folderPath)) continue
      const w = server.watcher
      const dead = !w || (w as unknown as { closed?: boolean }).closed === true
      if (dead) {
        log.warn(`Watcher for "${server.name}" detected unhealthy by heartbeat; restarting`)
        void w?.close().catch(() => {})
        server.watcher = this.createWatcher(server.id, server.folderPath, server.ignore)
        this.notifyWatcherUnhealthy(server.id)
      }
    }
  }

  private notifyWatcherUnhealthy(siteId: string): void {
    for (const cb of this.watcherUnhealthyCallbacks) {
      try {
        cb(siteId)
      } catch (err) {
        log.error('Watcher-unhealthy callback error:', err)
      }
    }
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
