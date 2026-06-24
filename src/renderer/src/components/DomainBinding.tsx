import { useState, useEffect, useCallback } from 'react'
import type { DnsVerifyResult } from '../../../shared/types'
import CopyButton from './CopyButton'

interface Props {
  domain: string
  tunnelId: string
  /** Latest tunnel error (already human-translated upstream, e.g. a 1016). */
  tunnelError?: string
}

type Status = 'checking' | 'verified' | 'failed' | 'manual'

const STATUS_LABEL: Record<Status, string> = {
  checking: '驗證中…',
  verified: '已生效',
  failed: '尚未生效',
  manual: '已手動標記'
}

/**
 * TIM-227 — Custom-domain CNAME info card + live propagation check.
 * Shows the CNAME record the user must point at the tunnel, lets them copy the
 * target, and verifies (via DNS lookup in main) that it resolves — with a
 * manual-override escape hatch for slow/odd resolvers.
 */
function DomainBinding({ domain, tunnelId, tunnelError }: Props): React.ReactElement {
  const cnameTarget = `${tunnelId}.cfargotunnel.com`
  const [status, setStatus] = useState<Status>('checking')
  const [message, setMessage] = useState<string | null>(null)

  const check = useCallback(async () => {
    setStatus('checking')
    setMessage(null)
    try {
      const r: DnsVerifyResult = await window.electron.verifyDomainDns(domain, tunnelId)
      if (r.verified) {
        setStatus('verified')
      } else {
        setStatus('failed')
        setMessage(r.message)
      }
    } catch (err) {
      setStatus('failed')
      setMessage(err instanceof Error ? err.message : 'DNS 驗證失敗')
    }
  }, [domain, tunnelId])

  useEffect(() => {
    void check()
  }, [check])

  return (
    <div className="domain-binding">
      <div className="section-label">自訂網域 · DNS</div>
      <div className="db-card">
        <div className="db-head">
          <span className="db-domain">{domain}</span>
          <span className={`db-status ${status}`}>{STATUS_LABEL[status]}</span>
        </div>
        <p className="db-hint">
          若你的網域不是由 Cloudflare 代管，請到 DNS 服務商新增以下 CNAME 記錄。Cloudflare 代管的網域已自動建立。
        </p>
        <div className="kv db-record">
          <div className="kvi"><div className="k">Type</div><div className="v">CNAME</div></div>
          <div className="kvi"><div className="k">Name</div><div className="v">{domain}</div></div>
          <div className="kvi">
            <div className="k">Target</div>
            <div className="v db-target">
              <span>{cnameTarget}</span>
              <CopyButton text={cnameTarget} tooltip="複製 CNAME 目標" variant="icon" />
            </div>
          </div>
        </div>
        {message && <p className="db-msg">{message}</p>}
        {tunnelError && <p className="db-msg db-err">Tunnel：{tunnelError}</p>}
        <div className="db-actions">
          <button className="btn btn-sm" onClick={() => void check()} disabled={status === 'checking'}>
            {status === 'checking' ? '檢查中…' : '重新檢查'}
          </button>
          {status !== 'verified' && status !== 'manual' && (
            <button className="btn btn-sm" onClick={() => { setStatus('manual'); setMessage(null) }}>
              手動標記已設定
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default DomainBinding
