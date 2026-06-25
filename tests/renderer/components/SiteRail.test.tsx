import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import SiteRail from '../../../src/renderer/src/components/SiteRail'
import type { SiteInfo } from '../../../src/shared/types'

// Render the rail to static markup (no DOM, no effects) and assert each row's
// quick open/copy actions: present with the right URL when a site is reachable,
// absent for a stopped site that has no reachable address.
const sharing: SiteInfo = {
  id: 'a', name: 'portfolio', serveMode: 'static', folderPath: '~/p',
  port: 3014, status: 'running', url: 'http://localhost:3014',
  tunnel: { type: 'quick', status: 'running', publicUrl: 'https://calm-river-8821.trycloudflare.com' },
  tags: []
}
const stopped: SiteInfo = {
  id: 'b', name: 'api-mock', serveMode: 'proxy', proxyTarget: 'http://localhost:8787',
  passthrough: true, passthroughPort: 8787, port: 8787, status: 'stopped', url: '', tags: []
}

function renderRail(sites: SiteInfo[]): string {
  return renderToStaticMarkup(
    createElement(SiteRail, {
      sites,
      totalCount: sites.length,
      runningCount: sites.filter((s) => s.status === 'running').length,
      selectedSiteId: null,
      query: '',
      onQueryChange: () => {},
      onSelect: () => {},
      onAddSite: () => {},
      onOpenSettings: () => {}
    })
  )
}

describe('SiteRail — per-row quick actions', () => {
  it('a reachable (sharing) row gets an open link to its primary URL + a copy button', () => {
    const html = renderRail([sharing])
    expect(html).toContain('class="ract"')
    // open link points at the full public tunnel URL (scheme kept)
    expect(html).toContain('href="https://calm-river-8821.trycloudflare.com"')
    expect(html).toContain('target="_blank"')
    expect(html).toContain('開啟網站')
    expect(html).toContain('複製網址')
  })

  it('a stopped row shows neither action (no reachable URL)', () => {
    const html = renderRail([stopped])
    expect(html).not.toContain('class="ract"')
    expect(html).not.toContain('開啟網站')
    expect(html).not.toContain('複製網址')
    // ...but the row itself still renders, with its stopped hint
    expect(html).toContain('已停止 · Port 8787')
  })

  it('renders a mixed list: only the reachable row carries actions', () => {
    const html = renderRail([sharing, stopped])
    // exactly one open link across both rows
    expect(html.match(/開啟網站/g)?.length).toBe(1)
  })
})
