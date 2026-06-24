import { promises as dns } from 'node:dns'

/**
 * TIM-227 — Custom-domain CNAME propagation verification.
 *
 * A cloudflared named tunnel is reached at `<tunnelId>.cfargotunnel.com`. When
 * the user's domain is on Cloudflare, `cloudflared tunnel route dns` creates the
 * CNAME automatically; when it's on an external DNS provider, the user must add
 * the CNAME by hand. Either way, this module lets the UI confirm — in real time
 * — that the domain's CNAME actually resolves to the tunnel target before
 * trusting the public URL.
 */

/** The CNAME target a domain must point at for a given tunnel. */
export function cfargoTarget(tunnelId: string): string {
  return `${tunnelId}.cfargotunnel.com`
}

function normalizeHost(h: string): string {
  return h.trim().toLowerCase().replace(/\.$/, '')
}

export type CnameVerifyResult =
  | { verified: true; found: string[] }
  | { verified: false; found: string[]; reason: 'not_found' | 'mismatch' | 'lookup_error'; message: string }

type CnameResolver = (domain: string) => Promise<string[]>

/**
 * Check whether `domain`'s CNAME resolves to `expectedTarget`. Pure w.r.t. the
 * injected resolver so it can be unit-tested without real DNS. Comparison is
 * case-insensitive and trailing-dot-insensitive.
 */
export async function verifyCname(
  domain: string,
  expectedTarget: string,
  resolver: CnameResolver = (d) => dns.resolveCname(d)
): Promise<CnameVerifyResult> {
  const want = normalizeHost(expectedTarget)
  let records: string[]
  try {
    records = await resolver(domain)
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code
    if (code === 'ENOTFOUND' || code === 'ENODATA') {
      return {
        verified: false,
        found: [],
        reason: 'not_found',
        message: `尚未偵測到 ${domain} 的 CNAME 記錄。請在 DNS 服務商新增指向 ${expectedTarget} 的 CNAME，並等待傳播（可能數分鐘）。`
      }
    }
    const detail = err instanceof Error ? err.message : String(err)
    return {
      verified: false,
      found: [],
      reason: 'lookup_error',
      message: `查詢 ${domain} 的 DNS 時發生錯誤：${detail}。請稍後重試。`
    }
  }

  const found = records.map(normalizeHost)
  if (found.includes(want)) {
    return { verified: true, found: records }
  }
  return {
    verified: false,
    found: records,
    reason: 'mismatch',
    message:
      records.length > 0
        ? `${domain} 的 CNAME 目前指向 ${records.join(', ')}，應指向 ${expectedTarget}。`
        : `尚未偵測到 ${domain} 指向 ${expectedTarget} 的 CNAME。`
  }
}
