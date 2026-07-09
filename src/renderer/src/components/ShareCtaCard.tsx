interface Props {
  /** Reuses the existing share action (Cloudflare Quick Tunnel) — same as the WAN lane play button. */
  onShare: () => void
}

const BoltIcon = (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M13 2L4 14h7l-1 8 9-12h-7z" />
  </svg>
)
const ShareIcon = (
  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
  </svg>
)

/**
 * Sidebar call-to-action shown when a running site is not yet shared to the public network.
 * Mirrors the Direction B `.cta-card` prototype; the button triggers the same Quick Tunnel
 * share flow as the WAN lane's play control.
 */
function ShareCtaCard({ onShare }: Props): React.ReactElement {
  return (
    <div className="cta-card">
      <div className="ct"><span className="ci">{BoltIcon}</span>一鍵建立 Tunnel</div>
      <div className="cd">此網站目前僅在本機與區網可見。建立 Cloudflare Quick Tunnel 即可取得公開網址，免帳號、免設定。</div>
      <button className="btn btn-primary btn-sm" style={{ width: '100%', justifyContent: 'center' }} onClick={onShare}>
        {ShareIcon}立即分享
      </button>
    </div>
  )
}

export default ShareCtaCard
