import { useEffect } from 'react'

interface UseUrlAddNotificationOptions {
  onSuccess: (message: string) => void
  onError: (message: string) => void
}

export function useUrlAddNotification({ onSuccess, onError }: UseUrlAddNotificationOptions): void {
  useEffect(() => {
    const unsub = window.electron.onUrlAddResult((result) => {
      if (result.success) {
        onSuccess(`Site "${result.siteName}" added successfully`)
      } else {
        onError(result.errorMessage || 'Failed to add site from Finder')
      }
    })
    return unsub
  }, [onSuccess, onError])
}
