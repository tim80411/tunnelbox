import { describe, it, expect, vi } from 'vitest'
import { output, link } from '@/cli/output'

describe('output', () => {
  it('outputs JSON when json=true with string data', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    output('hello', true)

    expect(logSpy).toHaveBeenCalledWith(JSON.stringify({ success: true, data: 'hello' }))
    logSpy.mockRestore()
  })

  it('outputs JSON when json=true with object data', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    output({ name: 'test' }, true)

    expect(logSpy).toHaveBeenCalledWith(
      JSON.stringify({ success: true, data: { name: 'test' } }),
    )
    logSpy.mockRestore()
  })

  it('outputs JSON when json=true with array data', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    output([{ a: 1 }], true)

    expect(logSpy).toHaveBeenCalledWith(
      JSON.stringify({ success: true, data: [{ a: 1 }] }),
    )
    logSpy.mockRestore()
  })

  it('outputs string directly when json=false', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    output('hello world', false)

    expect(logSpy).toHaveBeenCalledWith('hello world')
    logSpy.mockRestore()
  })

  it('outputs "No items found." for empty array when json=false', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    output([], false)

    expect(logSpy).toHaveBeenCalledWith('No items found.')
    logSpy.mockRestore()
  })

  it('calls console.table for non-empty array when json=false', () => {
    const tableSpy = vi.spyOn(console, 'table').mockImplementation(() => {})

    output([{ name: 'a' }, { name: 'b' }], false)

    expect(tableSpy).toHaveBeenCalledWith([{ name: 'a' }, { name: 'b' }])
    tableSpy.mockRestore()
  })

  it('outputs objects directly when json=false', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    output({ key: 'value' }, false)

    expect(logSpy).toHaveBeenCalledWith({ key: 'value' })
    logSpy.mockRestore()
  })
})

describe('link', () => {
  it('returns plain URL when stdout is not a TTY', () => {
    const origIsTTY = process.stdout.isTTY
    process.stdout.isTTY = undefined as any
    expect(link('http://localhost:3000')).toBe('http://localhost:3000')
    process.stdout.isTTY = origIsTTY
  })

  it('returns plain custom text when stdout is not a TTY', () => {
    const origIsTTY = process.stdout.isTTY
    process.stdout.isTTY = undefined as any
    expect(link('http://localhost:3000', 'click here')).toBe('click here')
    process.stdout.isTTY = origIsTTY
  })

  it('wraps URL with OSC 8 escape sequences when stdout is a TTY', () => {
    const origIsTTY = process.stdout.isTTY
    process.stdout.isTTY = true
    const result = link('http://localhost:3000')
    expect(result).toBe('\x1b]8;;http://localhost:3000\x07http://localhost:3000\x1b]8;;\x07')
    process.stdout.isTTY = origIsTTY
  })

  it('uses custom text with OSC 8 when stdout is a TTY', () => {
    const origIsTTY = process.stdout.isTTY
    process.stdout.isTTY = true
    const result = link('http://localhost:3000', 'click here')
    expect(result).toBe('\x1b]8;;http://localhost:3000\x07click here\x1b]8;;\x07')
    process.stdout.isTTY = origIsTTY
  })
})
