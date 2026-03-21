import { useState, useEffect } from 'react'
import QRCode from 'qrcode'

interface QrButtonProps {
  url: string
  title?: string
  subtitle?: string
}

const QR_OPTIONS: QRCode.QRCodeToDataURLOptions = { width: 280, margin: 1 }

function QrButton({ url, title = 'QR Code', subtitle }: QrButtonProps): React.ReactElement {
  const [open, setOpen] = useState(false)
  const [dataUrl, setDataUrl] = useState('')

  useEffect(() => {
    let cancelled = false
    setDataUrl('')
    QRCode.toDataURL(url, QR_OPTIONS)
      .then((result) => { if (!cancelled) setDataUrl(result) })
      .catch(() => { if (!cancelled) setDataUrl('') })
    return () => {
      cancelled = true
    }
  }, [url])

  return (
    <>
      <button
        className="btn-copy"
        onClick={() => setOpen(true)}
        data-tooltip="顯示 QR Code"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="2" width="8" height="8" rx="1" />
          <rect x="14" y="2" width="8" height="8" rx="1" />
          <rect x="2" y="14" width="8" height="8" rx="1" />
          <rect x="14" y="14" width="4" height="4" rx="0.5" />
          <rect x="20" y="14" width="2" height="2" />
          <rect x="14" y="20" width="2" height="2" />
          <rect x="20" y="20" width="2" height="2" />
        </svg>
      </button>
      {open && (
        <div className="modal-overlay" data-dismiss onClick={() => setOpen(false)}>
          <div className="modal qr-modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">{title}</h2>
            {dataUrl && (
              <img className="qr-modal__img" src={dataUrl} width={280} height={280} alt="QR Code" />
            )}
            <p className="qr-modal__url">{url}</p>
            {subtitle && (
              <p className="qr-modal__iface">{subtitle}</p>
            )}
          </div>
        </div>
      )}
    </>
  )
}

export default QrButton
