import { useState, useRef } from 'react'

interface CopyButtonProps {
  text: string
  tooltip: string
  disabled?: boolean
  variant?: 'icon' | 'inline'
}

function CopyButton({ text, tooltip, disabled, variant = 'icon' }: CopyButtonProps): React.ReactElement {
  const [copied, setCopied] = useState(false)
  const [failed, setFailed] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout>>(null)

  const handleClick = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text)
      setFailed(false)
      setCopied(true)
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => setCopied(false), 1500)
    } catch (err) {
      console.error('[CopyButton] clipboard write failed', err)
      setCopied(false)
      setFailed(true)
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => setFailed(false), 1500)
    }
  }

  const className = variant === 'inline'
    ? `btn-inline-copy${failed ? ' btn-inline-copy--error' : ''}`
    : `btn-icon${copied ? ' btn-icon--active' : ''}${failed ? ' btn-icon--error' : ''}`

  const currentTooltip = failed ? '複製失敗' : copied ? '已複製！' : tooltip

  return (
    <button
      className={className}
      onClick={handleClick}
      aria-label={currentTooltip}
      data-tooltip={currentTooltip}
      data-copied={copied || failed ? '' : undefined}
      disabled={disabled}
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="9" y="2" width="6" height="4" rx="1" />
        <path d="M9 4H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2" />
      </svg>
    </button>
  )
}

export default CopyButton
