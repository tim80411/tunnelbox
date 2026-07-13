import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import CopyButton from '../../../src/renderer/src/components/CopyButton'

// The copy control is icon-only; its label lives in a CSS data-tooltip that a
// screen reader can't see. It must also expose an accessible name so assistive
// tech announces "複製網址", not a bare "button".
describe('CopyButton — accessible name', () => {
  it('exposes its tooltip as an accessible name (aria-label)', () => {
    const html = renderToStaticMarkup(
      createElement(CopyButton, { text: 'https://example.com', tooltip: '複製網址' })
    )
    expect(html).toContain('aria-label="複製網址"')
  })
})
