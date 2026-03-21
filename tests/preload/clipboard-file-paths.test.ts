import { describe, it, expect } from 'vitest'
import { parseMacOSFilePaths, parseWindowsDropFiles } from '@/preload/clipboard-file-paths'

describe('parseMacOSFilePaths', () => {
  it('parses a plist with a single path', () => {
    const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<array>\t<string>/Users/foo/my-site</string>
</array>
</plist>`
    expect(parseMacOSFilePaths(plist)).toEqual(['/Users/foo/my-site'])
  })

  it('parses a plist with multiple paths', () => {
    const plist = `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<array>\t<string>/Users/foo/site-a</string>
\t<string>/Users/foo/site-b</string>
\t<string>/Users/foo/site-c</string>
</array>
</plist>`
    expect(parseMacOSFilePaths(plist)).toEqual([
      '/Users/foo/site-a',
      '/Users/foo/site-b',
      '/Users/foo/site-c',
    ])
  })

  it('returns empty array for empty string', () => {
    expect(parseMacOSFilePaths('')).toEqual([])
  })

  it('returns empty array for non-plist text', () => {
    expect(parseMacOSFilePaths('Hello World')).toEqual([])
  })
})

describe('parseWindowsDropFiles', () => {
  function buildDropFilesBuffer(paths: string[]): Buffer {
    const headerSize = 20
    const pathBuffers = paths.map((p) => {
      const buf = Buffer.alloc((p.length + 1) * 2)
      buf.write(p, 'utf16le')
      return buf
    })
    const terminator = Buffer.alloc(2, 0)
    const dataSize = pathBuffers.reduce((sum, b) => sum + b.length, 0) + terminator.length

    const buffer = Buffer.alloc(headerSize + dataSize)
    buffer.writeUInt32LE(headerSize, 0) // pFiles offset
    buffer.writeUInt32LE(0, 4)  // pt.x
    buffer.writeUInt32LE(0, 8)  // pt.y
    buffer.writeUInt32LE(0, 12) // fNC
    buffer.writeUInt32LE(1, 16) // fWide = true (UTF-16)

    let offset = headerSize
    for (const pb of pathBuffers) {
      pb.copy(buffer, offset)
      offset += pb.length
    }
    terminator.copy(buffer, offset)
    return buffer
  }

  it('parses a buffer with a single path', () => {
    const buf = buildDropFilesBuffer(['C:\\Users\\foo\\my-site'])
    expect(parseWindowsDropFiles(buf)).toEqual(['C:\\Users\\foo\\my-site'])
  })

  it('parses a buffer with multiple paths', () => {
    const buf = buildDropFilesBuffer([
      'C:\\Users\\foo\\site-a',
      'D:\\Projects\\site-b',
    ])
    expect(parseWindowsDropFiles(buf)).toEqual([
      'C:\\Users\\foo\\site-a',
      'D:\\Projects\\site-b',
    ])
  })

  it('returns empty array for empty buffer', () => {
    expect(parseWindowsDropFiles(Buffer.alloc(0))).toEqual([])
  })

  it('returns empty array for buffer too small', () => {
    expect(parseWindowsDropFiles(Buffer.alloc(10))).toEqual([])
  })

  it('returns empty array when fWide is 0 (ANSI format)', () => {
    const buf = Buffer.alloc(22, 0)
    buf.writeUInt32LE(20, 0)  // pFiles
    buf.writeUInt32LE(0, 16)  // fWide = 0 (ANSI)
    expect(parseWindowsDropFiles(buf)).toEqual([])
  })
})
