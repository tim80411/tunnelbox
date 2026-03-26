import net from 'node:net'
import { createLogger } from './logger'

const log = createLogger('PortHealthChecker')

const POLL_INTERVAL_MS = 5000
const CONNECT_TIMEOUT_MS = 1000

/**
 * Polls a TCP port at a fixed interval, notifying callers of reachability changes.
 * Only connects to localhost (127.0.0.1) — passthrough sites are always local.
 */
export class PortHealthChecker {
  private timer: ReturnType<typeof setInterval> | null = null
  private generation = 0
  private _isReachable = false
  private onReachable: (() => void) | null = null
  private onUnreachable: (() => void) | null = null

  constructor(private readonly port: number) {}

  get isReachable(): boolean {
    return this._isReachable
  }

  /**
   * Start polling. Fires an immediate probe, then repeats every 5 seconds.
   * `onReachable` is called when probe succeeds and prior state was not reachable.
   * `onUnreachable` is called when probe fails and prior state was reachable.
   */
  start(onReachable: () => void, onUnreachable: () => void): void {
    this.onReachable = onReachable
    this.onUnreachable = onUnreachable

    // Immediate first probe
    this.probe()

    this.timer = setInterval(() => this.probe(), POLL_INTERVAL_MS)
  }

  stop(): void {
    this.generation++ // invalidate all in-flight probes
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    this.onReachable = null
    this.onUnreachable = null
  }

  private probe(): void {
    const gen = this.generation
    const socket = net.createConnection({ host: '127.0.0.1', port: this.port })
    socket.setTimeout(CONNECT_TIMEOUT_MS)

    socket.on('connect', () => {
      socket.destroy()
      if (gen !== this.generation) return // stale probe
      if (!this._isReachable) {
        this._isReachable = true
        log.info(`Port ${this.port} is reachable`)
        this.onReachable?.()
      }
    })

    const markUnreachable = (reason: string): void => {
      socket.destroy()
      if (gen !== this.generation) return // stale probe
      if (this._isReachable) {
        this._isReachable = false
        log.warn(`Port ${this.port} ${reason}`)
        this.onUnreachable?.()
      }
    }

    socket.on('error', () => markUnreachable('is unreachable'))
    socket.on('timeout', () => markUnreachable('probe timed out'))
  }
}
