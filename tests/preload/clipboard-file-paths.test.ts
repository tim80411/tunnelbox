import { describe, it, expect } from 'vitest'
import { parseMacOSFilePaths } from '@/preload/clipboard-file-paths'

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
