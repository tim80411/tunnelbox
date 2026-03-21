import { useEffect, useCallback } from 'react'
import { isFocusOnEditable } from '../utils/dom'
import { executePaste } from './paste-logic'

interface UsePasteToAddOptions {
  onError: (message: string) => void
}

export function usePasteToAdd({ onError }: UsePasteToAddOptions): void {
  const handlePaste = useCallback(async () => {
    if (isFocusOnEditable()) return
    await executePaste(window.electron, onError)
  }, [onError])

  useEffect(() => {
    const unsub = window.electron.onPasteShortcut(handlePaste)
    return unsub
  }, [handlePaste])
}
