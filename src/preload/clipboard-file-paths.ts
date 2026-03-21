/**
 * Parse macOS NSFilenamesPboardType XML plist to extract file paths.
 * Returns an array of absolute paths, or empty array if parsing fails.
 */
export function parseMacOSFilePaths(plistXml: string): string[] {
  if (!plistXml || !plistXml.includes('<string>')) return []
  const paths: string[] = []
  const regex = /<string>(.*?)<\/string>/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(plistXml)) !== null) {
    const path = match[1].trim()
    if (path) paths.push(path)
  }
  return paths
}

/**
 * Parse Windows CF_HDROP (DROPFILES) buffer to extract file paths.
 * Structure: 20-byte header, then UTF-16LE null-terminated strings, double-null terminated.
 */
export function parseWindowsDropFiles(buffer: Buffer): string[] {
  if (!buffer || buffer.length < 22) return []

  const pFiles = buffer.readUInt32LE(0)
  const fWide = buffer.readUInt32LE(16)

  if (fWide !== 1) return []

  const paths: string[] = []
  let offset = pFiles
  while (offset < buffer.length - 1) {
    let end = offset
    while (end < buffer.length - 1) {
      if (buffer.readUInt16LE(end) === 0) break
      end += 2
    }
    if (end === offset) break // Double null = end of list
    const path = buffer.toString('utf16le', offset, end)
    if (path) paths.push(path)
    offset = end + 2
  }
  return paths
}
