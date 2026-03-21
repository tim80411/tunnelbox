import { useState, useRef } from 'react'

interface CopyButtonProps {
  text: string
  tooltip: string
  disabled?: boolean
}

function CopyButton({ text, tooltip, disabled }: CopyButtonProps): React.ReactElement {
  const [copied, setCopied] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout>>(null)

  const handleClick = async () => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setCopied(false), 1500)
  }

  return (
    <button
      className={`btn-icon${copied ? ' btn-icon--active' : ''}`}
      onClick={handleClick}
      data-tooltip={copied ? '已複製！' : tooltip}
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
