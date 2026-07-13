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
      onOpenSettings: () => {},
      onStartServer: () => {},
      onStopServer: () => {},
      onStartRename: () => {},
      onRemove: () => {}
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

  it('a stopped row still gets the ⋯ more-actions trigger, but no open/copy', () => {
    const html = renderRail([stopped])
    expect(html).toContain('class="ract"')       // .ract now renders on every row
    expect(html).toContain('更多動作')             // the ⋯ trigger is present
    expect(html).not.toContain('開啟網站')          // but with no URL there is no open/copy
    expect(html).not.toContain('複製網址')
    expect(html).toContain('已停止 · 連接埠 8787')
  })

  it('renders a mixed list: only the reachable row carries actions', () => {
    const html = renderRail([sharing, stopped])
    // exactly one open link across both rows
    expect(html.match(/開啟網站/g)?.length).toBe(1)
  })
})

describe('SiteRail — search field a11y', () => {
  it('the search input is a labelled search field', () => {
    const html = renderRail([sharing])
    expect(html).toContain('aria-label="搜尋網站"')
    expect(html).toContain('type="search"')
  })
})

// D2-2: rows were <div onClick> — unreachable by keyboard/SR. They must form a
// real listbox so an assistive-tech user can perceive and select sites.
describe('SiteRail — listbox semantics (D2-2)', () => {
  function renderSelected(): string {
    return renderToStaticMarkup(
      createElement(SiteRail, {
        sites: [sharing, stopped],
        totalCount: 2,
        runningCount: 1,
        selectedSiteId: 'a',
        query: '',
        onQueryChange: () => {},
        onSelect: () => {},
        onAddSite: () => {},
        onOpenSettings: () => {},
        onStartServer: () => {},
        onStopServer: () => {},
        onStartRename: () => {},
        onRemove: () => {}
      })
    )
  }

  it('the list is a labelled, focusable listbox', () => {
    const html = renderSelected()
    expect(html).toContain('role="listbox"')
    expect(html).toContain('aria-label="網站清單"')
    expect(html).toContain('tabindex="0"')
  })

  it('every row is an option with a stable id', () => {
    const html = renderSelected()
    expect(html).toContain('role="option"')
    expect(html).toContain('id="site-opt-a"')
    expect(html).toContain('id="site-opt-b"')
  })

  it('exactly the selected row is aria-selected and is the active descendant', () => {
    const html = renderSelected()
    expect((html.match(/aria-selected="true"/g) ?? []).length).toBe(1)
    expect(html).toContain('aria-activedescendant="site-opt-a"')
  })
})

describe('SiteRail — add-site button placement (B)', () => {
  it('the add button lives in rail-head, and rail-foot holds only settings', () => {
    const html = renderRail([sharing])
    const headIdx = html.indexOf('class="rail-head"')
    const listIdx = html.indexOf('class="rail-list"')
    const addIdx = html.indexOf('新增網站')
    expect(headIdx).toBeGreaterThanOrEqual(0)
    expect(addIdx).toBeGreaterThan(headIdx)
    expect(addIdx).toBeLessThan(listIdx)
    const footHtml = html.slice(html.indexOf('class="rail-foot"'))
    expect(footHtml).not.toContain('新增網站')
    expect(footHtml).toContain('系統設定')
  })
})
