import { useEffect } from 'react'

interface UseUrlAddNotificationOptions {
  onSuccess: (message: string) => void
  onError: (message: string) => void
}

export function useUrlAddNotification({ onSuccess, onError }: UseUrlAddNotificationOptions): void {
  useEffect(() => {
    const unsub = window.electron.onUrlAddResult((result) => {
      if (result.success) {
        onSuccess(`已成功新增網站「${result.siteName}」`)
      } else {
        onError(result.errorMessage || '無法從 Finder 新增網站')
      }
    })
    return unsub
  }, [onSuccess, onError])
}
