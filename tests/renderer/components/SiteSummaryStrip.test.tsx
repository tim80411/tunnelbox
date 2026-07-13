import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import SiteSummaryStrip from '../../../src/renderer/src/components/SiteSummaryStrip'
import type { SiteCounts, SiteFilter } from '../../../src/renderer/src/utils/site-view'

function render(filter: SiteFilter): string {
  const counts: SiteCounts = { total: 3, running: 1, sharing: 0, stopped: 2 }
  return renderToStaticMarkup(
    createElement(SiteSummaryStrip, { counts, filter, onFilterChange: () => {} })
  )
}

describe('SiteSummaryStrip — filter a11y (#9)', () => {
  it('marks exactly the active filter aria-pressed="true", the rest "false"', () => {
    const html = render('all')
    expect((html.match(/aria-pressed="true"/g) ?? []).length).toBe(1)
    expect((html.match(/aria-pressed="false"/g) ?? []).length).toBe(2)
  })
  it('moves aria-pressed onto the selected filter', () => {
    const html = render('share')
    expect((html.match(/aria-pressed="true"/g) ?? []).length).toBe(1)
    expect((html.match(/aria-pressed="false"/g) ?? []).length).toBe(2)
  })
})
