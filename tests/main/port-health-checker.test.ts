import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import net from 'node:net'
import { PortHealthChecker } from '../../src/main/port-health-checker'

// Mock the logger
vi.mock('../../src/main/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  })
}))

describe('PortHealthChecker', () => {
  let checker: PortHealthChecker
  let server: net.Server

  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(async () => {
    checker?.stop()
    vi.useRealTimers()
    if (server?.listening) {
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  })

  it('reports reachable when port has a running server', async () => {
    vi.useRealTimers() // Need real timers for net.createServer

    // Start a real TCP server on a random port
    server = net.createServer()
    const port = await new Promise<number>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address() as net.AddressInfo
        resolve(addr.port)
      })
    })

    checker = new PortHealthChecker(port)

    const onReachable = vi.fn()
    const onUnreachable = vi.fn()

    checker.start(onReachable, onUnreachable)

    // Wait for the first probe to complete
    await new Promise((resolve) => setTimeout(resolve, 200))

    expect(checker.isReachable).toBe(true)
    expect(onReachable).toHaveBeenCalledTimes(1)
    expect(onUnreachable).not.toHaveBeenCalled()
  })

  it('reports unreachable when no server is running on port', async () => {
    vi.useRealTimers()

    // Use a port that is very unlikely to have a running server
    checker = new PortHealthChecker(19999)

    const onReachable = vi.fn()
    const onUnreachable = vi.fn()

    checker.start(onReachable, onUnreachable)

    // Wait for probe to complete (may need to wait for timeout)
    await new Promise((resolve) => setTimeout(resolve, 2000))

    expect(checker.isReachable).toBe(false)
    expect(onReachable).not.toHaveBeenCalled()
    // onUnreachable not called because initial state is already unreachable
  })

  it('stop prevents further callbacks', async () => {
    vi.useRealTimers()

    checker = new PortHealthChecker(19999)

    const onReachable = vi.fn()
    const onUnreachable = vi.fn()

    checker.start(onReachable, onUnreachable)
    checker.stop()

    await new Promise((resolve) => setTimeout(resolve, 200))

    expect(onReachable).not.toHaveBeenCalled()
    expect(onUnreachable).not.toHaveBeenCalled()
  })

  it('detects transition from reachable to unreachable', async () => {
    vi.useRealTimers()

    server = net.createServer()
    const port = await new Promise<number>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address() as net.AddressInfo
        resolve(addr.port)
      })
    })

    checker = new PortHealthChecker(port)

    const onReachable = vi.fn()
    const onUnreachable = vi.fn()

    checker.start(onReachable, onUnreachable)

    // Wait for first probe to succeed
    await new Promise((resolve) => setTimeout(resolve, 200))
    expect(onReachable).toHaveBeenCalledTimes(1)

    // Close the server
    await new Promise<void>((resolve) => server.close(() => resolve()))

    // Wait for next poll cycle (5s) + probe time
    await new Promise((resolve) => setTimeout(resolve, 6500))

    expect(onUnreachable).toHaveBeenCalledTimes(1)
  }, 15000)
})
