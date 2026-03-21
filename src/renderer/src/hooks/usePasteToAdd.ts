import { useEffect, useCallback } from 'react'
import { isFocusOnEditable } from '../utils/dom'

interface UsePasteToAddOptions {
  onError: (message: string) => void
}

export function usePasteToAdd({ onError }: UsePasteToAddOptions): void {
  const handlePaste = useCallback(async () => {
    if (isFocusOnEditable()) return

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
      await window.electron.addSite({ serveMode: 'static', name: folderName, folderPath: text })
    } catch (err) {
      onError(err instanceof Error ? err.message : '新增網頁失敗')
    }
  }, [onError])

  useEffect(() => {
    const unsub = window.electron.onPasteShortcut(handlePaste)
    return unsub
  }, [handlePaste])
}
