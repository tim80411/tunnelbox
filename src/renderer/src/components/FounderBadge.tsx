interface FounderBadgeProps {
  founderTier: number
  size?: 'sm' | 'default'
}

function FounderBadge({ founderTier, size = 'default' }: FounderBadgeProps): React.ReactElement {
  const isSmall = size === 'sm'
  return (
    <span
      className="founder-badge"
      title={`前 100 名永久 Founder 身份`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: isSmall ? '2px 6px' : '3px 8px',
        borderRadius: 'var(--radius)',
        background: '#fdf6e3',
        border: '1px solid #e8c84a',
        color: '#7a5c00',
        fontSize: isSmall ? 11 : 12,
        fontWeight: 600,
        fontFamily: 'var(--font-mono)',
        letterSpacing: '0.02em',
        lineHeight: 1,
        whiteSpace: 'nowrap'
      }}
    >
      Founder #{founderTier}
    </span>
  )
}

export default FounderBadge
