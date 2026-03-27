import { describe, it, expect, vi, beforeEach } from 'vitest'
import { VisitorTracker } from '../../src/main/visitor-tracker'
import type http from 'node:http'

// Mock the logger
vi.mock('../../src/main/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  })
}))

function makeRequest(headers: Record<string, string | string[]> = {}, url = '/'): http.IncomingMessage {
  return {
    headers,
    url
  } as unknown as http.IncomingMessage
}

describe('VisitorTracker', () => {
  let tracker: VisitorTracker

  beforeEach(() => {
    tracker = new VisitorTracker()
  })

  describe('extractVisitorIp', () => {
    it('returns null when no forwarding headers are present', () => {
      const req = makeRequest({})
      expect(tracker.extractVisitorIp(req)).toBeNull()
    })

    it('extracts IP from cf-connecting-ip header', () => {
      const req = makeRequest({ 'cf-connecting-ip': '1.2.3.4' })
      expect(tracker.extractVisitorIp(req)).toBe('1.2.3.4')
    })

    it('extracts IP from x-forwarded-for header', () => {
      const req = makeRequest({ 'x-forwarded-for': '5.6.7.8, 10.0.0.1' })
      expect(tracker.extractVisitorIp(req)).toBe('5.6.7.8')
    })

    it('prefers cf-connecting-ip over x-forwarded-for', () => {
      const req = makeRequest({
        'cf-connecting-ip': '1.1.1.1',
        'x-forwarded-for': '2.2.2.2'
      })
      expect(tracker.extractVisitorIp(req)).toBe('1.1.1.1')
    })

    it('handles array-valued cf-connecting-ip', () => {
      const req = makeRequest({ 'cf-connecting-ip': ['3.3.3.3'] })
      expect(tracker.extractVisitorIp(req)).toBe('3.3.3.3')
    })

    it('handles array-valued x-forwarded-for', () => {
      const req = makeRequest({ 'x-forwarded-for': ['4.4.4.4, 10.0.0.1'] })
      expect(tracker.extractVisitorIp(req)).toBe('4.4.4.4')
    })
  })

  describe('trackRequest', () => {
    it('emits visitor event when request comes through tunnel', () => {
      const listener = vi.fn()
      tracker.on('visitor', listener)

      const req = makeRequest({ 'x-forwarded-for': '9.9.9.9' }, '/page.html')
      tracker.trackRequest(req, 'site-1', 'My Site')

      expect(listener).toHaveBeenCalledOnce()
      const event = listener.mock.calls[0][0]
      expect(event.siteId).toBe('site-1')
      expect(event.visitorIp).toBe('9.9.9.9')
      expect(event.siteName).toBe('My Site')
      expect(event.requestPath).toBe('/page.html')
      expect(event.timestamp).toBeTypeOf('number')
    })

    it('does not emit when no forwarding headers (localhost access)', () => {
      const listener = vi.fn()
      tracker.on('visitor', listener)

      const req = makeRequest({}, '/')
      tracker.trackRequest(req, 'site-1', 'My Site')

      expect(listener).not.toHaveBeenCalled()
    })

    it('handles multiple independent visitors', () => {
      const listener = vi.fn()
      tracker.on('visitor', listener)

      tracker.trackRequest(
        makeRequest({ 'x-forwarded-for': '1.1.1.1' }),
        'site-1',
        'Site A'
      )
      tracker.trackRequest(
        makeRequest({ 'x-forwarded-for': '2.2.2.2' }),
        'site-1',
        'Site A'
      )

      expect(listener).toHaveBeenCalledTimes(2)
      expect(listener.mock.calls[0][0].visitorIp).toBe('1.1.1.1')
      expect(listener.mock.calls[1][0].visitorIp).toBe('2.2.2.2')
    })

    it('does not throw or break when listener throws', () => {
      tracker.on('visitor', () => {
        throw new Error('listener broke')
      })

      // trackRequest catches internal errors so it never throws
      expect(() => {
        tracker.trackRequest(
          makeRequest({ 'x-forwarded-for': '1.1.1.1' }),
          'site-1',
          'Site A'
        )
      }).not.toThrow()
    })

    it('uses / as default path when req.url is undefined', () => {
      const listener = vi.fn()
      tracker.on('visitor', listener)

      const req = makeRequest({ 'x-forwarded-for': '1.1.1.1' })
      req.url = undefined as unknown as string
      tracker.trackRequest(req, 'site-1', 'Site A')

      expect(listener.mock.calls[0][0].requestPath).toBe('/')
    })
  })
})
