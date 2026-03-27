import { readFileSync, writeFileSync, mkdirSync, unlinkSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { getAppDataDir } from './paths'

export interface ApiInfo {
  port: number
  pid: number
  token?: string
}

export function getApiInfoPath(): string {
  return join(getAppDataDir(), 'api.json')
}

/**
 * Write API server info to the discovery file.
 * Called after the HTTP server is confirmed listening.
 */
export function writeApiInfo(info: ApiInfo, filePath?: string): void {
  const p = filePath ?? getApiInfoPath()
  mkdirSync(dirname(p), { recursive: true })
  writeFileSync(p, JSON.stringify(info, null, 2), 'utf-8')
}

/**
 * Read API server info from the discovery file.
 * Returns null if file is absent or malformed.
 */
export function readApiInfo(filePath?: string): ApiInfo | null {
  try {
    const raw = readFileSync(filePath ?? getApiInfoPath(), 'utf-8')
    const data = JSON.parse(raw)
    if (typeof data.port === 'number' && typeof data.pid === 'number') {
      return data as ApiInfo
    }
    return null
  } catch {
    return null
  }
}

/**
 * Delete the API discovery file. Best-effort (ignores errors).
 */
export function deleteApiInfo(filePath?: string): void {
  try {
    unlinkSync(filePath ?? getApiInfoPath())
  } catch {
    // best-effort cleanup
  }
}
