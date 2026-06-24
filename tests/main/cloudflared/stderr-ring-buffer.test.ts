import { describe, it, expect, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { isPackaged: false },
}))

import { StderrRingBuffer } from '../../../src/main/cloudflared/stderr-ring-buffer'

describe('StderrRingBuffer', () => {
  it('keeps the most recent N lines and drops the oldest', () => {
    const buf = new StderrRingBuffer(3)
    buf.push('a\n')
    buf.push('b\n')
    buf.push('c\n')
    buf.push('d\n')
    expect(buf.lines()).toEqual(['b', 'c', 'd'])
  })

  it('splits multi-line chunks into individual lines', () => {
    const buf = new StderrRingBuffer(50)
    buf.push('line one\nline two\nline three\n')
    expect(buf.lines()).toEqual(['line one', 'line two', 'line three'])
  })

  it('ignores blank lines but keeps content', () => {
    const buf = new StderrRingBuffer(50)
    buf.push('real\n\n   \nmore\n')
    expect(buf.lines()).toEqual(['real', 'more'])
  })

  it('exposes a snapshot string joined by newlines', () => {
    const buf = new StderrRingBuffer(50)
    buf.push('one\n')
    buf.push('two\n')
    expect(buf.snapshot()).toBe('one\ntwo')
  })

  it('clears all buffered lines', () => {
    const buf = new StderrRingBuffer(50)
    buf.push('one\ntwo\n')
    buf.clear()
    expect(buf.lines()).toEqual([])
    expect(buf.snapshot()).toBe('')
  })

  it('handles a partial chunk without trailing newline', () => {
    const buf = new StderrRingBuffer(50)
    buf.push('partial without newline')
    expect(buf.lines()).toEqual(['partial without newline'])
  })
})
