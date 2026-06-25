import { describe, it, expect } from 'vitest'
import { isAllowedExternalUrl, isInternalUrl } from '@/main/navigation-policy'

describe('isAllowedExternalUrl (shell.openExternal scheme allowlist — TIM-310 / F11+F08)', () => {
  it('allows http(s) and mailto', () => {
    expect(isAllowedExternalUrl('https://github.com/tim80411/tunnelbox')).toBe(true)
    expect(isAllowedExternalUrl('http://example.com')).toBe(true)
    expect(isAllowedExternalUrl('mailto:support@example.com')).toBe(true)
  })

  it('blocks dangerous schemes that shell.openExternal would hand to the OS', () => {
    expect(isAllowedExternalUrl('file:///Applications/Calculator.app')).toBe(false)
    expect(isAllowedExternalUrl('smb://attacker/share')).toBe(false)
    expect(isAllowedExternalUrl('javascript:alert(1)')).toBe(false)
    expect(isAllowedExternalUrl('ms-msdt:/id')).toBe(false)
    expect(isAllowedExternalUrl('vscode://x')).toBe(false)
  })

  it('rejects malformed URLs', () => {
    expect(isAllowedExternalUrl('not a url')).toBe(false)
    expect(isAllowedExternalUrl('')).toBe(false)
  })
})

describe('isInternalUrl (will-navigate guard — TIM-310 / F10)', () => {
  const dev = 'http://localhost:5173'

  it('treats the prod file:// bundle as internal', () => {
    expect(isInternalUrl('file:///app/renderer/index.html')).toBe(true)
  })

  it('treats same-origin dev URLs as internal', () => {
    expect(isInternalUrl('http://localhost:5173/', dev)).toBe(true)
    expect(isInternalUrl('http://localhost:5173/foo?x=1#h', dev)).toBe(true)
  })

  it('does not mistake a port-prefix neighbour for the dev origin', () => {
    expect(isInternalUrl('http://localhost:51730/evil', dev)).toBe(false)
  })

  it('blocks external navigation (would otherwise expose the IPC bridge)', () => {
    expect(isInternalUrl('https://evil.com', dev)).toBe(false)
    expect(isInternalUrl('https://evil.com')).toBe(false)
    expect(isInternalUrl('not a url', dev)).toBe(false)
  })
})
