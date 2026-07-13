import { describe, it, expect } from 'vitest'
import { clampMenuPosition, siteRowMenuItems } from '../../../src/renderer/src/utils/site-row-menu'
import type { SiteInfo } from '../../../src/shared/types'

describe('clampMenuPosition', () => {
  it('keeps an in-bounds position unchanged', () => {
    expect(clampMenuPosition(100, 100, 160, 120, 1000, 800)).toEqual({ x: 100, y: 100 })
  })
  it('pushes right/bottom overflow back inside the viewport', () => {
    expect(clampMenuPosition(980, 760, 160, 120, 1000, 800, 8)).toEqual({ x: 832, y: 672 })
  })
  it('never crosses the top/left padding', () => {
    expect(clampMenuPosition(-50, -50, 160, 120, 1000, 800, 8)).toEqual({ x: 8, y: 8 })
  })
})

describe('siteRowMenuItems', () => {
  const base: SiteInfo = { id: 'a', name: 'x', serveMode: 'static', folderPath: '~/x', port: 3000, status: 'stopped', url: '', tags: [] }
  it('offers 啟動 for a stopped site', () => {
    expect(siteRowMenuItems(base).find(i => i.key === 'toggle')?.label).toBe('啟動')
  })
  it('offers 停止 for a running site', () => {
    expect(siteRowMenuItems({ ...base, status: 'running' }).find(i => i.key === 'toggle')?.label).toBe('停止')
  })
  it('marks 移除 danger + separator and omits 在瀏覽器開啟', () => {
    const items = siteRowMenuItems(base)
    expect(items.find(i => i.key === 'remove')).toMatchObject({ danger: true, separatorBefore: true })
    expect(items.map(i => i.label)).not.toContain('在瀏覽器開啟')
  })
})
