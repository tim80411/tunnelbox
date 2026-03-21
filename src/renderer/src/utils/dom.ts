export function isFocusOnEditable(): boolean {
  const el = document.activeElement as HTMLElement | null
  const tag = el?.tagName?.toLowerCase()
  return tag === 'input' || tag === 'textarea' || tag === 'select' || !!el?.isContentEditable
}
