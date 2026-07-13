// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import SiteRowMenu from '../../../src/renderer/src/components/SiteRowMenu'
import type { SiteInfo } from '../../../src/shared/types'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const site: SiteInfo = { id: 'a', name: 'docs', serveMode: 'static', folderPath: '~/d', port: 3000, status: 'stopped', url: '', tags: [] }

let root: Root | null = null
let container: HTMLDivElement | null = null
function mount(el: React.ReactElement): void {
  container = document.createElement('div'); document.body.appendChild(container)
  root = createRoot(container); act(() => { root!.render(el) })
}
afterEach(() => { act(() => { root?.unmount() }); container?.remove(); root = null; container = null })
const menu = (): HTMLElement | null => document.body.querySelector('[role="menu"]')

describe('SiteRowMenu (jsdom)', () => {
  it('renders a portal menu in document.body with 3 menuitems (啟動 for stopped)', () => {
    mount(<SiteRowMenu site={site} anchor={{ x: 10, y: 10 }} onAction={() => {}} onClose={() => {}} />)
    const m = menu()
    expect(m).not.toBeNull()
    expect(container!.contains(m)).toBe(false)   // portaled outside the mount container
    const items = m!.querySelectorAll('[role="menuitem"]')
    expect(items.length).toBe(3)
    expect(items[0].textContent).toBe('啟動')
    expect(m!.textContent).toContain('移除')
    expect(m!.textContent).not.toContain('在瀏覽器開啟')
  })

  it('clicking 移除 calls onAction("remove", site) then onClose', () => {
    const onAction = vi.fn(); const onClose = vi.fn()
    mount(<SiteRowMenu site={site} anchor={{ x: 10, y: 10 }} onAction={onAction} onClose={onClose} />)
    const remove = Array.from(menu()!.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')).find(b => b.textContent === '移除')!
    act(() => { remove.click() })
    expect(onAction).toHaveBeenCalledWith('remove', site)
    expect(onClose).toHaveBeenCalled()
  })

  it('Escape closes the menu', () => {
    const onClose = vi.fn()
    mount(<SiteRowMenu site={site} anchor={{ x: 10, y: 10 }} onAction={() => {}} onClose={onClose} />)
    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })) })
    expect(onClose).toHaveBeenCalled()
  })

  it('a mousedown outside the menu closes it', () => {
    const onClose = vi.fn()
    mount(<SiteRowMenu site={site} anchor={{ x: 10, y: 10 }} onAction={() => {}} onClose={onClose} />)
    act(() => { document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })) })
    expect(onClose).toHaveBeenCalled()
  })
})
