export interface PasteElectronAPI {
  readClipboardFilePaths: () => Promise<string[]>
  readClipboardText: () => Promise<string>
  addSite: (params: { serveMode: 'static'; name: string; folderPath: string }) => Promise<unknown>
}

/**
 * Core paste-to-add logic, extracted for testability.
 * No React or DOM dependencies.
 *
 * Priority: file paths from OS clipboard > plain text path.
 * Directory filtering is handled upstream by the preload layer.
 */
export async function executePaste(
  electron: PasteElectronAPI,
  onError: (message: string) => void,
): Promise<void> {
  // 1. Try file paths first (from OS file manager copy)
  const filePaths = await electron.readClipboardFilePaths()
  if (filePaths.length > 0) {
    for (const filePath of filePaths) {
      const folderName = filePath.split(/[\\/]/).filter(Boolean).pop() || filePath
      try {
        await electron.addSite({ serveMode: 'static', name: folderName, folderPath: filePath })
      } catch (err) {
        onError(err instanceof Error ? err.message : '新增網頁失敗')
      }
    }
    return
  }

  // 2. Fallback to clipboard text
  let text = (await electron.readClipboardText()).trim()
  if ((text.startsWith("'") && text.endsWith("'")) || (text.startsWith('"') && text.endsWith('"'))) {
    text = text.slice(1, -1)
  }
  if (!text || text.includes('\n') || text.includes('\r')) return
  if (!text.startsWith('/') && !/^[a-zA-Z]:\\/.test(text)) return

  const folderName = text.split(/[\\/]/).filter(Boolean).pop() || text
  try {
    await electron.addSite({ serveMode: 'static', name: folderName, folderPath: text })
  } catch (err) {
    onError(err instanceof Error ? err.message : '新增網頁失敗')
  }
}
