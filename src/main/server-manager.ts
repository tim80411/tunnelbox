import http from 'node:http'
import path from 'node:path'
import fs from 'node:fs'
import handler from 'serve-handler'
import { watch, type FSWatcher } from 'chokidar'
import { WebSocketServer, type WebSocket } from 'ws'
import getPort from 'get-port'
import crypto from 'node:crypto'

// ---------- Types ----------

export interface SiteServer {
  id: string
  name: string
  folderPath: string
  port: number
  status: 'running' | 'stopped' | 'error'
  httpServer?: http.Server
  watcher?: FSWatcher
  wsServer?: WebSocketServer
}

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

export class ServerManager {
  private servers: Map<string, SiteServer> = new Map()
  private fileChangeCallbacks: Set<FileChangeCallback> = new Set()
  private debounceTimers: Map<string, ReturnType<typeof setTimeout>> = new Map()

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

    this.globalWsServer = new WebSocketServer({ port: this.globalWsPort })

    this.globalWsServer.on('connection', (ws, req) => {
      const url = new URL(req.url || '/', `http://localhost:${this.globalWsPort}`)
      const siteId = url.searchParams.get('siteId') || ''

      if (!this.wsClients.has(siteId)) {
        this.wsClients.set(siteId, new Set())
      }
      this.wsClients.get(siteId)!.add(ws)

      ws.on('close', () => {
        this.wsClients.get(siteId)?.delete(ws)
      })

      ws.on('error', () => {
        this.wsClients.get(siteId)?.delete(ws)
      })
    })

    this.globalWsServer.on('error', (err) => {
      console.error('[ServerManager] WebSocket server error:', err)
    })

    console.log(`[ServerManager] Global WebSocket server started on port ${this.globalWsPort}`)
  }

  /**
   * Start a new HTTP server + file watcher for the given site.
   */
  async startServer(site: { id: string; name: string; folderPath: string }): Promise<SiteServer> {
    // If the server already exists and is running, stop it first (restart scenario)
    const existing = this.servers.get(site.id)
    if (existing && existing.status === 'running') {
      await this.stopServer(site.id)
    }

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

    // Get available port in range 3000-9000
    const portRange = Array.from({ length: 6001 }, (_, i) => 3000 + i)
    let port: number
    try {
      port = await getPort({ port: portRange })
    } catch {
      throw new Error('無可用的 Port（範圍 3000-9000 皆被佔用）')
    }

    // Verify port is in valid range
    if (port < 3000 || port > 9000) {
      throw new Error('無可用的 Port（範圍 3000-9000 皆被佔用）')
    }

    const wsPort = this.globalWsPort

    // Create HTTP server with serve-handler, injecting hot reload script into HTML responses
    const httpServer = http.createServer((req, res) => {
      // Intercept HTML responses to inject reload script
      const originalWriteHead = res.writeHead.bind(res)
      const originalEnd = res.end.bind(res)
      let isHtml = false
      let chunks: Buffer[] = []

      res.writeHead = function (
        statusCode: number,
        ...args: unknown[]
      ): http.ServerResponse {
        // Detect if this is an HTML response
        const headers =
          args.length === 2 ? (args[1] as http.OutgoingHttpHeaders) : (args[0] as http.OutgoingHttpHeaders | undefined)

        if (headers) {
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
        if (isHtml) {
          if (Buffer.isBuffer(chunk)) {
            chunks.push(chunk)
          } else if (typeof chunk === 'string') {
            chunks.push(Buffer.from(chunk))
          }
          return true
        }
        return (originalWrite as (...a: unknown[]) => boolean)(chunk, ...args)
      } as typeof res.write

      res.end = function (...args: unknown[]): http.ServerResponse {
        if (isHtml) {
          if (args[0]) {
            if (Buffer.isBuffer(args[0])) {
              chunks.push(args[0])
            } else if (typeof args[0] === 'string') {
              chunks.push(Buffer.from(args[0]))
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
        directoryListing: true
      })
    })

    // Start listening
    await new Promise<void>((resolve, reject) => {
      httpServer.on('error', (err) => {
        reject(new Error(`伺服器啟動失敗（Port ${port}）：${err.message}`))
      })
      httpServer.listen(port, () => {
        resolve()
      })
    })

    // Start file watcher
    const watcher = this.createWatcher(site.id, site.folderPath)

    const siteServer: SiteServer = {
      id: site.id,
      name: site.name,
      folderPath: site.folderPath,
      port,
      status: 'running',
      httpServer,
      watcher
    }

    this.servers.set(site.id, siteServer)
    console.log(`[ServerManager] Server for "${site.name}" started on http://localhost:${port}`)

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

    // Close file watcher
    if (server.watcher) {
      await server.watcher.close()
      server.watcher = undefined
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
    console.log(`[ServerManager] Server "${server.name}" stopped`)
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

    console.log('[ServerManager] All servers stopped')
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
  registerStopped(site: { id: string; name: string; folderPath: string }): void {
    this.servers.set(site.id, {
      id: site.id,
      name: site.name,
      folderPath: site.folderPath,
      port: 0,
      status: 'stopped'
    })
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

  // ---------- Private ----------

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
      console.error(`[ServerManager] Watcher error for site ${siteId}:`, err)
      // Stop the watcher on error but don't crash
      watcher.close().catch(() => {})
      const server = this.servers.get(siteId)
      if (server) {
        server.watcher = undefined
      }
    })

    return watcher
  }

  private notifyFileChange(siteId: string): void {
    // Notify all registered callbacks
    for (const cb of this.fileChangeCallbacks) {
      try {
        cb(siteId)
      } catch (err) {
        console.error('[ServerManager] File change callback error:', err)
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
          console.error('[ServerManager] WebSocket send error:', err)
        }
      }
    }
  }
}
