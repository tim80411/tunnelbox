import { useEffect, useRef } from 'react'

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * The Tab-trap decision, kept pure (no DOM access) so it is unit-testable
 * without a render harness. Given the dialog's focusable items, the currently
 * focused element and whether Shift is held, returns the element that should
 * receive focus to keep Tab cyclic — or null if the browser default is fine.
 */
export function nextTrapFocus(
  items: HTMLElement[],
  activeEl: HTMLElement | null,
  shiftKey: boolean
): HTMLElement | null {
  if (items.length === 0) return null
  const first = items[0]
  const last = items[items.length - 1]
  const inside = activeEl != null && items.includes(activeEl)
  if (shiftKey) {
    if (!inside || activeEl === first) return last
  } else {
    if (!inside || activeEl === last) return first
  }
  return null
}

/**
 * Focus management for a modal dialog (D2-4). When `active` becomes true it
 * remembers the previously-focused element, moves focus into the dialog, and
 * traps Tab inside it; when `active` goes false (or the dialog unmounts) it
 * restores focus to where it was. Attach the returned ref to the dialog
 * container and give that container `tabIndex={-1}` so it can accept focus as a
 * fallback. Do NOT also set `autoFocus` on a child — this hook owns focus-in,
 * and an autoFocus firing first would corrupt the "restore" target.
 */
export function useDialogFocus<T extends HTMLElement = HTMLDivElement>(
  active: boolean
): React.RefObject<T | null> {
  const ref = useRef<T | null>(null)
  useEffect(() => {
    const container = ref.current
    if (!active || !container) return

    const previouslyFocused = document.activeElement as HTMLElement | null
    const focusables = (): HTMLElement[] =>
      Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))

    // Prefer an explicit [data-autofocus] target (e.g. the primary input) over
    // the first focusable, which is often a header close button.
    const preferred = container.querySelector<HTMLElement>('[data-autofocus]')
    const initial = focusables()
    ;(preferred ?? initial[0] ?? container).focus()

    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key !== 'Tab') return
      const target = nextTrapFocus(
        focusables(),
        document.activeElement as HTMLElement | null,
        e.shiftKey
      )
      if (target) {
        e.preventDefault()
        target.focus()
      }
    }
    container.addEventListener('keydown', onKeyDown)

    return () => {
      container.removeEventListener('keydown', onKeyDown)
      previouslyFocused?.focus?.()
    }
  }, [active])
  return ref
}
