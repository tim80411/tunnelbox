import { describe, it, expect, vi } from 'vitest'
import { executePaste } from '@/renderer/src/hooks/paste-logic'

function createMockElectron(overrides: Partial<{
  readClipboardFilePaths: () => string[]
  readClipboardText: () => string
  addSite: (params: any) => Promise<any>
}> = {}) {
  return {
    readClipboardFilePaths: overrides.readClipboardFilePaths ?? (() => []),
    readClipboardText: overrides.readClipboardText ?? (() => ''),
    addSite: overrides.addSite ?? vi.fn().mockResolvedValue({}),
  }
}

describe('executePaste', () => {
  it('adds site from file paths when available (spec scenario 1)', async () => {
    const addSite = vi.fn().mockResolvedValue({})
    const electron = createMockElectron({
      readClipboardFilePaths: () => ['/Users/foo/my-site'],
      addSite,
    })
    await executePaste(electron, vi.fn())
    expect(addSite).toHaveBeenCalledWith({
      serveMode: 'static',
      name: 'my-site',
      folderPath: '/Users/foo/my-site',
    })
  })

  it('adds multiple sites from multiple file paths (spec scenario 2)', async () => {
    const addSite = vi.fn().mockResolvedValue({})
    const electron = createMockElectron({
      readClipboardFilePaths: () => ['/Users/foo/site-a', '/Users/foo/site-b'],
      addSite,
    })
    await executePaste(electron, vi.fn())
    expect(addSite).toHaveBeenCalledTimes(2)
    expect(addSite).toHaveBeenCalledWith({
      serveMode: 'static', name: 'site-a', folderPath: '/Users/foo/site-a',
    })
    expect(addSite).toHaveBeenCalledWith({
      serveMode: 'static', name: 'site-b', folderPath: '/Users/foo/site-b',
    })
  })

  it('falls back to clipboard text when no file paths (spec scenario 3)', async () => {
    const addSite = vi.fn().mockResolvedValue({})
    const electron = createMockElectron({
      readClipboardFilePaths: () => [],
      readClipboardText: () => '/Users/foo/text-path',
      addSite,
    })
    await executePaste(electron, vi.fn())
    expect(addSite).toHaveBeenCalledWith({
      serveMode: 'static', name: 'text-path', folderPath: '/Users/foo/text-path',
    })
  })

  it('does nothing when clipboard has no file paths and no valid text (spec scenario 4)', async () => {
    const addSite = vi.fn()
    const electron = createMockElectron({
      readClipboardFilePaths: () => [],
      readClipboardText: () => 'Hello World',
      addSite,
    })
    await executePaste(electron, vi.fn())
    expect(addSite).not.toHaveBeenCalled()
  })

  it('calls onError when addSite fails (spec scenario 5 — folder gone)', async () => {
    const addSite = vi.fn().mockRejectedValue(new Error('資料夾不存在'))
    const onError = vi.fn()
    const electron = createMockElectron({
      readClipboardFilePaths: () => ['/nonexistent/path'],
      addSite,
    })
    await executePaste(electron, onError)
    expect(onError).toHaveBeenCalledWith('資料夾不存在')
  })

  it('does nothing when file paths is empty after filtering (spec scenarios 6/7)', async () => {
    const addSite = vi.fn()
    const electron = createMockElectron({
      readClipboardFilePaths: () => [],
      readClipboardText: () => '',
      addSite,
    })
    await executePaste(electron, vi.fn())
    expect(addSite).not.toHaveBeenCalled()
  })

  it('handles Windows-style paths', async () => {
    const addSite = vi.fn().mockResolvedValue({})
    const electron = createMockElectron({
      readClipboardFilePaths: () => ['C:\\Users\\foo\\my-site'],
      addSite,
    })
    await executePaste(electron, vi.fn())
    expect(addSite).toHaveBeenCalledWith({
      serveMode: 'static', name: 'my-site', folderPath: 'C:\\Users\\foo\\my-site',
    })
  })

  it('strips surrounding quotes from text path', async () => {
    const addSite = vi.fn().mockResolvedValue({})
    const electron = createMockElectron({
      readClipboardFilePaths: () => [],
      readClipboardText: () => '"/Users/foo/quoted-path"',
      addSite,
    })
    await executePaste(electron, vi.fn())
    expect(addSite).toHaveBeenCalledWith({
      serveMode: 'static', name: 'quoted-path', folderPath: '/Users/foo/quoted-path',
    })
  })

  it('ignores multiline text', async () => {
    const addSite = vi.fn()
    const electron = createMockElectron({
      readClipboardFilePaths: () => [],
      readClipboardText: () => '/Users/foo/path\n/Users/bar/path',
      addSite,
    })
    await executePaste(electron, vi.fn())
    expect(addSite).not.toHaveBeenCalled()
  })

  it('continues adding remaining folders when one fails (partial success)', async () => {
    const addSite = vi.fn()
      .mockRejectedValueOnce(new Error('失敗'))
      .mockResolvedValueOnce({})
    const onError = vi.fn()
    const electron = createMockElectron({
      readClipboardFilePaths: () => ['/bad/path', '/good/path'],
      addSite,
    })
    await executePaste(electron, onError)
    expect(addSite).toHaveBeenCalledTimes(2)
    expect(onError).toHaveBeenCalledTimes(1)
  })
})
