import { execFile } from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs'
import { app } from 'electron'
import type { CloudflaredEnv } from '../../shared/types'

const MIN_VERSION = '2024.1.0'

/** Where we install cloudflared if the user doesn't have it globally */
function getLocalBinaryPath(): string {
  const ext = process.platform === 'win32' ? '.exe' : ''
  return path.join(app.getPath('userData'), 'bin', `cloudflared${ext}`)
}

/** Run a command and return stdout */
function run(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: 10_000 }, (err, stdout, stderr) => {
      if (err) return reject(err)
      resolve((stdout || stderr).trim())
    })
  })
}

/** Try to find cloudflared on PATH or in our local install directory */
async function findBinary(): Promise<string | null> {
  // 1. Check local install
  const local = getLocalBinaryPath()
  if (fs.existsSync(local)) {
    return local
  }

  // 2. Check PATH via `which` (unix) or `where` (windows)
  const whichCmd = process.platform === 'win32' ? 'where' : 'which'
  try {
    const result = await run(whichCmd, ['cloudflared'])
    if (result) return result.split('\n')[0].trim()
  } catch {
    // not found on PATH
  }

  return null
}

/** Parse version string like "cloudflared version 2024.6.1 (built 2024-06-11-...)" */
function parseVersion(output: string): string | null {
  const match = output.match(/(\d+\.\d+\.\d+)/)
  return match ? match[1] : null
}

/** Compare two semver strings. Returns -1, 0, or 1. */
function compareSemver(a: string, b: string): number {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    if (pa[i] > pb[i]) return 1
    if (pa[i] < pb[i]) return -1
  }
  return 0
}

/** Detect cloudflared installation status and version */
export async function detectCloudflared(): Promise<CloudflaredEnv> {
  try {
    const binaryPath = await findBinary()
    if (!binaryPath) {
      return { status: 'not_installed' }
    }

    const output = await run(binaryPath, ['--version'])
    const version = parseVersion(output)

    if (!version) {
      return {
        status: 'error',
        errorMessage: '無法解析 cloudflared 版本資訊'
      }
    }

    if (compareSemver(version, MIN_VERSION) < 0) {
      return {
        status: 'outdated',
        version,
        errorMessage: `cloudflared 版本過舊（${version}），需要 ${MIN_VERSION} 以上`
      }
    }

    return { status: 'available', version }
  } catch (err) {
    return {
      status: 'error',
      errorMessage: `cloudflared 偵測失敗：${err instanceof Error ? err.message : String(err)}`
    }
  }
}

export { getLocalBinaryPath, findBinary, MIN_VERSION }
