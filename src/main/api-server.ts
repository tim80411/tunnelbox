import http from 'node:http'
import getPort from 'get-port'
import { createLogger } from './logger'
import { writeApiInfo, deleteApiInfo } from '../core/api-discovery'
import { startQuickTunnel, stopQuickTunnel, hasTunnel, getTunnelInfo } from './cloudflared'
import { loginCloudflare, logoutCloudflare, getAuthStatus } from './cloudflared'
import { bindFixedDomain, unbindFixedDomain } from './cloudflared'
import { installCloudflared, detectCloudflared } from './cloudflared'
import type { ServerManager } from './server-manager'

const log = createLogger('ApiServer')

let server: http.Server | null = null
let serverManager: ServerManager

/** Parse JSON body from an incoming request. */
function parseBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => {
      if (chunks.length === 0) return resolve({})
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf-8')))
      } catch {
        reject(new Error('Invalid JSON'))
      }
    })
    req.on('error', reject)
  })
}

/** Send a JSON response. */
function json(res: http.ServerResponse, statusCode: number, data: unknown): void {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(data))
}

/** Route: GET /health */
function handleHealth(_req: http.IncomingMessage, res: http.ServerResponse): void {
  json(res, 200, { ok: true, pid: process.pid })
}

/** Wrap an async handler with error catching. */
function asyncHandler(
  fn: (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void>
): (req: http.IncomingMessage, res: http.ServerResponse) => void {
  return (req, res) => {
    fn(req, res).catch((err) => {
      const message = err instanceof Error ? err.message : String(err)
      log.error(`Unhandled error in ${req.url}:`, err)
      if (!res.headersSent) json(res, 500, { error: message })
    })
  }
}

/** Route: POST /tunnel/quick */
async function handleTunnelQuick(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const body = await parseBody(req)
  const siteId = body.siteId as string
  if (!siteId) {
    json(res, 400, { error: 'Missing siteId' })
    return
  }

  const siteServer = serverManager.getServer(siteId)
  if (!siteServer) {
    json(res, 404, { error: 'Site not found' })
    return
  }

  // Auto-start server if not running
  let port: number
  if (siteServer.status === 'running') {
    port = siteServer.port
  } else {
    const started = await serverManager.startServer(siteServer as import('../shared/types').StoredSite)
    port = started.port
  }

  const publicUrl = await startQuickTunnel(siteId, port)
  json(res, 200, { publicUrl })
}

/** Route: POST /tunnel/stop */
async function handleTunnelStop(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const body = await parseBody(req)
  const siteId = body.siteId as string
  if (!siteId) {
    json(res, 400, { error: 'Missing siteId' })
    return
  }

  if (!hasTunnel(siteId)) {
    json(res, 200, { stopped: false, noTunnel: true })
    return
  }

  stopQuickTunnel(siteId)
  json(res, 200, { stopped: true })
}

/** Route: GET /tunnel/status?siteId=X */
function handleTunnelStatus(req: http.IncomingMessage, res: http.ServerResponse): void {
  const url = new URL(req.url || '/', 'http://localhost')
  const siteId = url.searchParams.get('siteId')
  if (!siteId) {
    json(res, 400, { error: 'Missing siteId query parameter' })
    return
  }

  const active = hasTunnel(siteId)
  const info = active ? getTunnelInfo(siteId) : undefined
  json(res, 200, { active, info })
}

/** Route: POST /auth/login */
async function handleAuthLogin(_req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const auth = await loginCloudflare()
  json(res, 200, auth)
}

/** Route: GET /auth/status */
function handleAuthStatus(_req: http.IncomingMessage, res: http.ServerResponse): void {
  const auth = getAuthStatus()
  json(res, 200, auth)
}

/** Route: POST /auth/logout */
async function handleAuthLogout(_req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  logoutCloudflare()
  json(res, 200, { success: true })
}

/** Route: POST /domain/bind */
async function handleDomainBind(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const body = await parseBody(req)
  const siteId = body.siteId as string
  const domain = body.domain as string
  if (!siteId || !domain) {
    json(res, 400, { error: 'Missing siteId or domain' })
    return
  }

  const siteServer = serverManager.getServer(siteId)
  if (!siteServer) {
    json(res, 404, { error: 'Site not found' })
    return
  }

  // Auto-start server if not running
  let port: number
  if (siteServer.status === 'running') {
    port = siteServer.port
  } else {
    const started = await serverManager.startServer(siteServer as import('../shared/types').StoredSite)
    port = started.port
  }

  const publicUrl = await bindFixedDomain(siteId, port, domain)
  json(res, 200, { publicUrl })
}

/** Route: POST /domain/unbind */
async function handleDomainUnbind(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const body = await parseBody(req)
  const siteId = body.siteId as string
  if (!siteId) {
    json(res, 400, { error: 'Missing siteId' })
    return
  }

  await unbindFixedDomain(siteId)
  json(res, 200, { success: true })
}

/** Route: POST /env/install */
async function handleEnvInstall(_req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  await installCloudflared()
  const env = await detectCloudflared()
  json(res, 200, { installed: true, version: env.version })
}

/** Route: GET /env/check */
async function handleEnvCheck(_req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const env = await detectCloudflared()
  json(res, 200, env)
}

/** Request router. */
function handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
  const url = req.url?.split('?')[0] || '/'
  const method = req.method || 'GET'

  if (method === 'GET' && url === '/health') {
    handleHealth(req, res)
  } else if (method === 'POST' && url === '/tunnel/quick') {
    asyncHandler(handleTunnelQuick)(req, res)
  } else if (method === 'POST' && url === '/tunnel/stop') {
    asyncHandler(handleTunnelStop)(req, res)
  } else if (method === 'GET' && url === '/tunnel/status') {
    handleTunnelStatus(req, res)
  } else if (method === 'POST' && url === '/auth/login') {
    asyncHandler(handleAuthLogin)(req, res)
  } else if (method === 'GET' && url === '/auth/status') {
    handleAuthStatus(req, res)
  } else if (method === 'POST' && url === '/auth/logout') {
    asyncHandler(handleAuthLogout)(req, res)
  } else if (method === 'POST' && url === '/domain/bind') {
    asyncHandler(handleDomainBind)(req, res)
  } else if (method === 'POST' && url === '/domain/unbind') {
    asyncHandler(handleDomainUnbind)(req, res)
  } else if (method === 'POST' && url === '/env/install') {
    asyncHandler(handleEnvInstall)(req, res)
  } else if (method === 'GET' && url === '/env/check') {
    asyncHandler(handleEnvCheck)(req, res)
  } else {
    json(res, 404, { error: 'Not found' })
  }
}

/**
 * Start the local HTTP API server.
 * Binds to 127.0.0.1 only (localhost). Writes port to discovery file after listening.
 */
export async function initApiServer(manager: ServerManager): Promise<void> {
  serverManager = manager

  const port = await getPort({ port: Array.from({ length: 100 }, (_, i) => 47321 + i) })

  server = http.createServer(handleRequest)

  await new Promise<void>((resolve, reject) => {
    server!.on('error', (err) => {
      log.error('API server error:', err)
      reject(err)
    })
    server!.listen(port, '127.0.0.1', () => {
      writeApiInfo({ port, pid: process.pid })
      log.info(`API server listening on http://127.0.0.1:${port}`)
      resolve()
    })
  })
}

/**
 * Stop the local HTTP API server and remove the discovery file.
 */
export async function stopApiServer(): Promise<void> {
  if (!server) {
    deleteApiInfo()
    return
  }

  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => resolve(), 2000)
    server!.close(() => {
      clearTimeout(timeout)
      resolve()
    })
  })
  server = null
  deleteApiInfo()
  log.info('API server stopped')
}
