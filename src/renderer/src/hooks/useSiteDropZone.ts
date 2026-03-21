import { useState, useRef, useCallback, useEffect } from 'react'

interface UseSiteDropZoneOptions {
  onError: (message: string) => void
}

interface SiteDropZoneResult {
  isDraggingOver: boolean
  dropZoneHandlers: {
    onDragEnter: React.DragEventHandler
    onDragLeave: React.DragEventHandler
    onDragOver: React.DragEventHandler
    onDrop: React.DragEventHandler
  }
}

export function useSiteDropZone({ onError }: UseSiteDropZoneOptions): SiteDropZoneResult {
  const [isDraggingOver, setIsDraggingOver] = useState(false)
  const dragCounter = useRef(0)

  // Reset drag state when drag is cancelled (e.g. Escape key)
  useEffect(() => {
    const reset = (): void => {
      dragCounter.current = 0
      setIsDraggingOver(false)
    }
    window.addEventListener('dragend', reset)
    return () => window.removeEventListener('dragend', reset)
  }, [])

  const onDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    dragCounter.current++
    if (dragCounter.current === 1) setIsDraggingOver(true)
  }, [])

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    dragCounter.current--
    if (dragCounter.current === 0) setIsDraggingOver(false)
  }, [])

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }, [])

  const onDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault()
      dragCounter.current = 0
      setIsDraggingOver(false)

      // Validate: must be a directory
      const item = e.dataTransfer.items[0]
      if (!item || item.kind !== 'file') return

      const entry = item.webkitGetAsEntry?.()
      if (entry && !entry.isDirectory) {
        onError('請拖曳資料夾，不支援單一檔案')
        return
      }

      const file = item.getAsFile()
      if (!file) return

      const folderPath = window.electron.getPathForFile(file)
      if (!folderPath) {
        onError('無法取得資料夾路徑')
        return
      }

      const folderName = folderPath.split(/[\\/]/).filter(Boolean).pop() || folderPath

      try {
        await window.electron.addSite({ serveMode: 'static', name: folderName, folderPath })
      } catch (err) {
        onError(err instanceof Error ? err.message : '新增網頁失敗')
      }
    },
    [onError]
  )

  return {
    isDraggingOver,
    dropZoneHandlers: { onDragEnter, onDragLeave, onDragOver, onDrop }
  }
}
