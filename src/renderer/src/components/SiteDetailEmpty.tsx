interface Props {
  variant: 'none' | 'stopped'
  siteName?: string
  onStart?: () => void
}

function SiteDetailEmpty({ variant, siteName, onStart }: Props): React.ReactElement {
  if (variant === 'stopped') {
    return (
      <div className="md-empty">
        <div className="eic">📦</div>
        <div className="et">站點已停止</div>
        <div className="ed">啟動「{siteName}」後即可取得本機、區域網路與公開網址。</div>
        {onStart && <button className="btn btn-primary" style={{ marginTop: 14 }} onClick={onStart}>啟動站點</button>}
      </div>
    )
  }
  return (
    <div className="md-empty">
      <div className="eic">📂</div>
      <div className="et">選擇一個網站</div>
      <div className="ed">從左側清單點選網站，即可在這裡查看完整的觸達資訊與動作。</div>
    </div>
  )
}

export default SiteDetailEmpty
