import { EventEmitter } from 'node:events'
import type http from 'node:http'
import { createLogger } from './logger'
import type { VisitorEvent } from '../shared/types'

const log = createLogger('VisitorTracker')

/**
 * VisitorTracker listens for HTTP requests that arrive through a tunnel
 * (as opposed to localhost/direct access) and emits visitor events.
 *
 * Detection strategy: tunnel proxies (e.g. Cloudflare, frp, bore) attach
 * forwarding headers such as `x-forwarded-for` or `cf-connecting-ip`.
 * A request with one of these headers is treated as a tunnel visitor.
 */
export class VisitorTracker extends EventEmitter {
  /**
   * Extract the real visitor IP from request headers.
   * Returns `null` when the request does not appear to come from a tunnel.
   */
  extractVisitorIp(req: http.IncomingMessage): string | null {
    // Cloudflare-specific header takes priority
    const cfIp = req.headers['cf-connecting-ip']
    if (cfIp) {
      return Array.isArray(cfIp) ? cfIp[0] : cfIp
    }

    // Generic forwarding header
    const xff = req.headers['x-forwarded-for']
    if (xff) {
      const raw = Array.isArray(xff) ? xff[0] : xff
      // x-forwarded-for may be a comma-separated list; first entry is the client
      const ip = raw.split(',')[0].trim()
      if (ip) return ip
    }

    return null
  }

  /**
   * Call this from the HTTP request handler to potentially emit a visitor event.
   * Errors here are caught so they never interfere with the response.
   */
  trackRequest(req: http.IncomingMessage, siteId: string, siteName: string): void {
    try {
      const visitorIp = this.extractVisitorIp(req)
      if (!visitorIp) return // not a tunnel request

      const event: VisitorEvent = {
        siteId,
        visitorIp,
        timestamp: Date.now(),
        requestPath: req.url || '/',
        siteName
      }

      this.emit('visitor', event)
    } catch (err) {
      log.error('Error tracking visitor:', err)
    }
  }
}

/** Singleton instance shared by the entire main process. */
export const visitorTracker = new VisitorTracker()
