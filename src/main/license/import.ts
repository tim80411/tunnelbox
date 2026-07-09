import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { verifyLicense, getLicensePath } from './verifier'
import { tierGate } from './tier-gate'
import type { ImportResult } from '../../shared/license-types'
import { createLogger } from '../logger'

const log = createLogger('License')

const REASON_MESSAGE: Record<string, string> = {
  no_license: '找不到授權檔。',
  invalid_signature: '授權簽章無效。',
  license_corrupted: '授權檔已損毀或缺少必要欄位。'
}

/**
 * Verify a license file and, only if valid, install it as the active license.
 *
 * verify-before-write: we validate the SOURCE path first and copy it into place
 * only on success, so a forged/corrupt import can never overwrite a good license.
 * Soft-locked (expired-but-compatible) licenses verify as valid and activate Pro
 * without error — the renew banner is handled separately (Story 107).
 */
export async function importLicenseFromFile(sourcePath: string): Promise<ImportResult> {
  const result = await verifyLicense(sourcePath)
  if (!result.valid) {
    return { ok: false, error: REASON_MESSAGE[result.reason] ?? '授權無效。' }
  }

  const dest = getLicensePath()
  try {
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    fs.copyFileSync(sourcePath, dest)
  } catch (err) {
    log.error('儲存授權檔失敗', err)
    return { ok: false, error: '無法儲存授權檔。' }
  }

  await tierGate.refresh() // broadcasts tier-gate:changed to every renderer
  return { ok: true, email: result.purchaser_email, founderTier: result.founder_tier }
}

/** Most-recently-modified `license*.json|dat` in ~/Downloads, or null. */
export function findDownloadedLicense(downloadsDir = path.join(os.homedir(), 'Downloads')): string | null {
  try {
    const dir = downloadsDir
    if (!fs.existsSync(dir)) return null
    const newest = fs
      .readdirSync(dir)
      .filter((f) => /^license.*\.(json|dat)$/i.test(f))
      .map((f) => path.join(dir, f))
      .map((p) => ({ p, mtime: fs.statSync(p).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime)[0]
    return newest?.p ?? null
  } catch {
    return null
  }
}
