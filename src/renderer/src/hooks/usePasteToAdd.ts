import { useEffect, useCallback } from 'react'

interface UsePasteToAddOptions {
  onError: (message: string) => void
}

export function usePasteToAdd({ onError }: UsePasteToAddOptions): void {
  const handlePaste = useCallback(async () => {
    // Skip if focus is on an interactive element
    const el = document.activeElement as HTMLElement | null
    const tag = el?.tagName?.toLowerCase()
    if (
      tag === 'input' ||
      tag === 'textarea' ||
      tag === 'select' ||
      el?.isContentEditable
    ) return

    let text = window.electron.readClipboardText().trim()
    // Strip surrounding quotes (single or double)
    if ((text.startsWith("'") && text.endsWith("'")) || (text.startsWith('"') && text.endsWith('"'))) {
      text = text.slice(1, -1)
    }
    if (!text || text.includes('\n') || text.includes('\r')) return

    // Only process absolute paths (Unix or Windows)
    if (!text.startsWith('/') && !/^[a-zA-Z]:\\/.test(text)) return

    // Extract folder name from path
    const folderName = text.split(/[\\/]/).filter(Boolean).pop() || text

    try {
      await window.electron.addSite(folderName, text)
    } catch (err) {
      onError(err instanceof Error ? err.message : '新增網頁失敗')
    }
  }, [onError])

  useEffect(() => {
    const unsub = window.electron.onPasteShortcut(handlePaste)
    return unsub
  }, [handlePaste])
}
