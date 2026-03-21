import { useState, useEffect, useRef } from 'react'
import QRCode from 'qrcode'

interface LanQrButtonProps {
  lanUrl: string
}

interface PopoverPos {
  top: number
  left: number
}

const POPOVER_WIDTH = 200
const POPOVER_HEIGHT = 230

function computePosition(btn: HTMLElement | null): PopoverPos {
  if (!btn) return { top: 0, left: 0 }
  const rect = btn.getBoundingClientRect()
  return {
    left: rect.left + rect.width / 2 - POPOVER_WIDTH / 2,
    top: rect.top - POPOVER_HEIGHT
  }
}

function LanQrButton({ lanUrl }: LanQrButtonProps): React.ReactElement {
  const [open, setOpen] = useState(false)
  const [dataUrl, setDataUrl] = useState('')
  const [pos, setPos] = useState<PopoverPos>({ top: 0, left: 0 })
  const btnRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    QRCode.toDataURL(lanUrl, { width: 180, margin: 1 }).then((url) => {
      if (!cancelled) setDataUrl(url)
    })
    return () => {
      cancelled = true
    }
  }, [open, lanUrl])

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        btnRef.current &&
        !btnRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  useEffect(() => {
    if (!open) return
    setPos(computePosition(btnRef.current))
    const update = () => setPos(computePosition(btnRef.current))
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [open])

  return (
    <>
      <button
        ref={btnRef}
        className="btn-copy"
        onClick={() => setOpen((prev) => !prev)}
        title="顯示 QR Code"
      >
        QR
      </button>
      {open && dataUrl && (
        <div
          ref={popoverRef}
          className="qr-popover"
          style={{ position: 'fixed', top: pos.top, left: pos.left }}
        >
          <button className="qr-popover__close" onClick={() => setOpen(false)}>
            &times;
          </button>
          <img src={dataUrl} width={180} height={180} alt="QR Code" />
          <p className="qr-popover__url">{lanUrl}</p>
        </div>
      )}
    </>
  )
}

export default LanQrButton
