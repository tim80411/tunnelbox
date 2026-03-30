import { describe, it, expect, vi } from 'vitest'

vi.mock('../../src/main/logger', () => ({
  createLogger: () => ({
    info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn()
  })
}))

const { generateDashboardHtml } = await import('../../src/main/dashboard-generator')

describe('DashboardGenerator', () => {
  it('generates HTML containing site entries', () => {
    const html = generateDashboardHtml([
      { name: 'Site A', url: 'https://a.trycloudflare.com', tags: ['client-1'] },
      { name: 'Site B', url: 'https://b.trycloudflare.com', tags: ['client-2'] },
    ])
    expect(html).toContain('Site A')
    expect(html).toContain('https://a.trycloudflare.com')
    expect(html).toContain('Site B')
    expect(html).toContain('client-1')
    expect(html).toContain('client-2')
  })

  it('generates empty state when no sites', () => {
    const html = generateDashboardHtml([])
    expect(html).toContain('目前沒有正在分享的站點')
  })

  it('includes group filter JS using URLSearchParams', () => {
    const html = generateDashboardHtml([
      { name: 'Site A', url: 'https://a.example.com', tags: ['client-1'] },
    ])
    expect(html).toContain('URLSearchParams')
    expect(html).toContain('group')
  })

  it('embeds site data as JSON for client-side filtering', () => {
    const html = generateDashboardHtml([
      { name: 'Test', url: 'https://test.com', tags: ['tag1', 'tag2'] },
    ])
    expect(html).toContain('"name":"Test"')
    expect(html).toContain('"tags":["tag1","tag2"]')
  })
})
