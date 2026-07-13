// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { nextTrapFocus, useDialogFocus } from '../../../src/renderer/src/hooks/useDialogFocus'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('nextTrapFocus (pure trap decision)', () => {
  it('wraps to the first item when Tab is pressed on the last', () => {
    const a = document.createElement('button')
    const b = document.createElement('button')
    expect(nextTrapFocus([a, b], b, false)).toBe(a)
  })

  it('wraps to the last item when Shift+Tab is pressed on the first', () => {
    const a = document.createElement('button')
    const b = document.createElement('button')
    expect(nextTrapFocus([a, b], a, true)).toBe(b)
  })

  it('leaves mid-list Tab to the browser default (returns null)', () => {
    const a = document.createElement('button')
    const b = document.createElement('button')
    const c = document.createElement('button')
    expect(nextTrapFocus([a, b, c], b, false)).toBeNull()
  })

  it('pulls focus back to the first item if it has escaped the dialog', () => {
    const a = document.createElement('button')
    const b = document.createElement('button')
    expect(nextTrapFocus([a, b], null, false)).toBe(a)
  })
})

function Harness(): React.ReactElement {
  const [open, setOpen] = useState(false)
  const ref = useDialogFocus<HTMLDivElement>(open)
  return (
    <div>
      <button id="trigger" onClick={() => setOpen(true)}>open</button>
      {open && (
        <div ref={ref} tabIndex={-1} role="dialog" id="dlg">
          <button id="first">first</button>
          <button id="last" onClick={() => setOpen(false)}>close</button>
        </div>
      )}
    </div>
  )
}

describe('useDialogFocus (rendered, jsdom)', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it('moves focus into the dialog on open and restores it on close', () => {
    act(() => root.render(<Harness />))
    const trigger = container.querySelector<HTMLButtonElement>('#trigger')!
    trigger.focus()
    expect(document.activeElement).toBe(trigger)

    act(() => trigger.click()) // open
    expect(document.activeElement?.id).toBe('first')

    act(() => container.querySelector<HTMLButtonElement>('#last')!.click()) // close
    expect(document.activeElement).toBe(trigger)
  })

  it('prefers a [data-autofocus] element over the first focusable', () => {
    function AutofocusHarness(): React.ReactElement {
      const [open, setOpen] = useState(false)
      const ref = useDialogFocus<HTMLDivElement>(open)
      return (
        <div>
          <button id="trigger2" onClick={() => setOpen(true)}>open</button>
          {open && (
            <div ref={ref} tabIndex={-1} role="dialog">
              <button id="closeX">×</button>
              <input id="preferred" data-autofocus />
            </div>
          )}
        </div>
      )
    }
    act(() => root.render(<AutofocusHarness />))
    const trigger = container.querySelector<HTMLButtonElement>('#trigger2')!
    trigger.focus()
    act(() => trigger.click())
    expect(document.activeElement?.id).toBe('preferred')
  })

  it('traps Tab inside the dialog (last wraps back to first)', () => {
    act(() => root.render(<Harness />))
    const trigger = container.querySelector<HTMLButtonElement>('#trigger')!
    trigger.focus()
    act(() => trigger.click())

    const last = container.querySelector<HTMLButtonElement>('#last')!
    last.focus()
    act(() => {
      last.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }))
    })
    expect(document.activeElement?.id).toBe('first')
  })
})
