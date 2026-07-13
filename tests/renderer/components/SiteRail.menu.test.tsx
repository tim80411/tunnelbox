// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import SiteRail from '../../../src/renderer/src/components/SiteRail'
import type { SiteInfo } from '../../../src/shared/types'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const stopped: SiteInfo = { id: 'b', name: 'api', serveMode: 'static', folderPath: '~/a', port: 3000, status: 'stopped', url: '', tags: [] }

let root: Root | null = null
let container: HTMLDivElement
function makeProps(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    sites: [stopped], totalCount: 1, runningCount: 0, selectedSiteId: null,
    query: '', onQueryChange: () => {}, onSelect: vi.fn(), onAddSite: () => {}, onOpenSettings: () => {},
    onStartServer: vi.fn(), onStopServer: vi.fn(), onStartRename: vi.fn(), onRemove: vi.fn(),
    ...over
  }
}
function mount(props: Record<string, unknown>): void {
  container = document.createElement('div'); document.body.appendChild(container)
  root = createRoot(container)
  act(() => { root!.render(<SiteRail {...(props as never)} />) })
}
afterEach(() => { act(() => { root?.unmount() }); container?.remove(); root = null })

describe('SiteRail — row context menu wiring (C/C+)', () => {
  it('right-clicking a row selects it and opens the portal menu', () => {
    const onSelect = vi.fn()
    mount(makeProps({ onSelect }))
    const row = container.querySelector<HTMLElement>('[role="option"]')!
    act(() => { row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 20, clientY: 20 })) })
    expect(onSelect).toHaveBeenCalledWith('b')
    expect(document.body.querySelector('[role="menu"]')).not.toBeNull()
  })

  it('menu 移除 routes to onRemove(site)', () => {
    const onRemove = vi.fn()
    mount(makeProps({ onRemove }))
    const row = container.querySelector<HTMLElement>('[role="option"]')!
    act(() => { row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 20, clientY: 20 })) })
    const remove = Array.from(document.body.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')).find(b => b.textContent === '移除')!
    act(() => { remove.click() })
    expect(onRemove).toHaveBeenCalledWith(stopped)
  })

  it('the ⋯ trigger (present even on a stopped/urlless row) opens the same menu', () => {
    mount(makeProps())
    const more = container.querySelector<HTMLButtonElement>('.railitem-more')
    expect(more).not.toBeNull()
    act(() => { more!.click() })
    expect(document.body.querySelector('[role="menu"]')).not.toBeNull()
  })
})
