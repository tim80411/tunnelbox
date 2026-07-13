import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import QrButton from '../../../src/renderer/src/components/QrButton'

// The QR trigger is icon-only with a CSS-only tooltip; give it a real
// accessible name so a screen-reader user knows what the button does.
describe('QrButton — accessible name', () => {
  it('the trigger button exposes an accessible name (aria-label)', () => {
    const html = renderToStaticMarkup(createElement(QrButton, { url: 'https://example.com' }))
    expect(html).toContain('aria-label="顯示 QR Code"')
  })
})
