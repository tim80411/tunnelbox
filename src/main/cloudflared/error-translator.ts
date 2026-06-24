import { createLogger } from '../logger'

const log = createLogger('ErrorTranslator')

/**
 * High-level classification of an error, used by callers to drive behaviour
 * (e.g. an `auth` error should prompt re-login rather than reconnect).
 */
export type ErrorCategory = 'auth' | 'quota' | 'network' | 'app' | 'unknown'

/**
 * Result of translating a raw cloudflared error string.
 * - `human`: user-facing zh-TW description of what went wrong.
 * - `suggestion`: actionable next step the user can take.
 * - `raw`: the original, unmodified input string, preserved for debugging / copy.
 * - `matched`: true if a known signature matched; false if the generic fallback
 *   was used. Lets callers decide whether to surface a more specific message.
 * - `category`: stable classification (`'unknown'` for the fallback). Prefer
 *   keying behaviour off this rather than matching on the `human` text.
 */
export interface TranslatedError {
  human: string
  suggestion: string
  raw: string
  matched: boolean
  category: ErrorCategory
}

/**
 * One entry in the translation table.
 * `pattern` is matched (case-insensitively) against the raw cloudflared output.
 * The table is ordered: the first matching entry wins, so more specific
 * patterns should be listed before broader ones.
 */
interface TranslationEntry {
  pattern: RegExp
  human: string
  suggestion: string
  category: ErrorCategory
}

/**
 * Central, table-driven translation table for known cloudflared error signatures.
 *
 * To extend: add a new entry. More specific patterns go higher up.
 * Cloudflare HTTP error code reference: https://developers.cloudflare.com/support/troubleshooting/http-status-codes/cloudflare-1xxx-errors/
 */
const TRANSLATION_TABLE: TranslationEntry[] = [
  {
    // Named-tunnel credential mismatch. Listed before the generic auth entry so
    // it wins, but still classified as `auth` to drive re-login downstream.
    pattern: /unauthorized:?\s*invalid tunnel secret|invalid tunnel secret/i,
    human: 'Tunnel 認證失敗：憑證無效（Invalid tunnel secret）',
    suggestion: '請重新登入 Cloudflare 帳號並重新建立此網域的 Tunnel。',
    category: 'auth',
  },
  {
    // 1016 — Origin DNS error: the edge can't resolve the origin / CNAME target.
    pattern: /\b1016\b/,
    human: 'Cloudflare 無法解析來源 DNS（錯誤 1016）',
    suggestion: '請確認網域的 DNS 記錄與 CNAME 設定正確，並等待 DNS 生效後再試。',
    category: 'network',
  },
  {
    // 1033 — Argo Tunnel error: tunnel offline / not found.
    pattern: /\b1033\b|argo tunnel error/i,
    human: 'Cloudflare Tunnel 目前無法連線（錯誤 1033）',
    suggestion: '請確認 Tunnel 仍在執行且網域已正確路由，必要時重新啟動 Tunnel。',
    category: 'network',
  },
  {
    // QUIC/HTTP2 stream-level reset surfaced as "Application error 0x0".
    pattern: /application error 0x0/i,
    human: '連線被本機應用程式重置（Application error 0x0）',
    suggestion: '請確認本機服務仍在執行且連接埠正確，然後重新公開分享。',
    category: 'app',
  },
  {
    // DNS resolution failure, e.g. "lookup protocol.argotunnel.com: no such host".
    pattern: /lookup .* no such host|no such host/i,
    human: '無法解析 Cloudflare 服務的網域，可能是網路或 DNS 問題',
    suggestion: '請檢查網路連線與本機 DNS 設定，必要時清除 DNS 快取後再試。',
    category: 'network',
  },

  // --- Named-tunnel auth / quota signatures (zh-TW phrases below are matched
  // downstream by named-tunnel.ts to decide re-login vs. retry, so keep the
  // "認證已過期" / "數量上限" wording stable). ---
  {
    pattern: /certificate.*expired|auth.*expired|\bunauthorized\b/i,
    human: '認證已過期，請重新登入',
    suggestion: '請重新登入 Cloudflare 帳號後再試。',
    category: 'auth',
  },
  {
    pattern: /tunnel limit|\bquota\b/i,
    human: '已達 Tunnel 數量上限',
    suggestion: '請至 Cloudflare 儀表板刪除未使用的 Tunnel 後再試。',
    category: 'quota',
  },

  // --- Generic network / connectivity signatures (shared by quick & named). ---
  {
    pattern: /failed to connect to edge/i,
    human: 'Cloudflare 服務暫時不可用，請稍後重試',
    suggestion: '這通常是暫時性問題，請稍後再試；若持續發生請檢查網路連線。',
    category: 'network',
  },
  {
    pattern: /connection reset/i,
    human: '連線中斷，請檢查網路連線',
    suggestion: '請檢查網路連線是否穩定後重新公開分享。',
    category: 'network',
  },
  {
    pattern: /connection refused/i,
    human: '無法連線至 Cloudflare，請檢查網路連線',
    suggestion: '請確認網路可正常連線至外部服務後再試。',
    category: 'network',
  },
  {
    pattern: /i\/o timeout|\btimeout\b/i,
    human: '連線逾時，請檢查網路連線',
    suggestion: '請檢查網路連線後重試；網路較慢時可稍候再試。',
    category: 'network',
  },
]

/** Safe fallback used for empty / unmatched / malformed input. */
const FALLBACK: Omit<TranslatedError, 'raw' | 'matched'> = {
  human: 'Tunnel 發生未知錯誤',
  suggestion: '請稍後重試；若問題持續，請檢查網路連線或重新啟動 Tunnel。',
  category: 'unknown',
}

/**
 * Translate a raw cloudflared error string into a user-friendly zh-TW message
 * plus an actionable suggestion. The original raw string is always preserved.
 *
 * This function is fully defensive: any unexpected input or internal failure
 * yields a safe fallback rather than throwing, so it is safe to call directly
 * inside event handlers and the tunnel state machine.
 */
export function translateCloudflaredError(raw: string): TranslatedError {
  try {
    const rawStr = typeof raw === 'string' ? raw : String(raw ?? '')

    for (const entry of TRANSLATION_TABLE) {
      if (entry.pattern.test(rawStr)) {
        return {
          human: entry.human,
          suggestion: entry.suggestion,
          raw: rawStr,
          matched: true,
          category: entry.category,
        }
      }
    }

    return { ...FALLBACK, raw: rawStr, matched: false }
  } catch (err) {
    // Never let a translation failure escape into the event flow.
    log.warn(`translateCloudflaredError failed: ${err instanceof Error ? err.message : String(err)}`)
    return { ...FALLBACK, raw: typeof raw === 'string' ? raw : '', matched: false }
  }
}
