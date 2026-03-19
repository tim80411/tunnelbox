import { execFile } from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs'
import { homedir } from 'node:os'
import type { CloudflaredEnv } from '../shared/types'

const MIN_VERSION = '2024.1.0'

function getLocalBinaryPath(): string {
  const ext = process.platform === 'win32' ? '.exe' : ''
  let appDataDir: string
  if (process.platform === 'darwin') {
    appDataDir = path.join(homedir(), 'Library', 'Application Support', 'tunnelbox')
  } else if (process.platform === 'win32') {
    appDataDir = path.join(
      process.env.APPDATA || path.join(homedir(), 'AppData', 'Roaming'),
      'tunnelbox',
    )
  } else {
    appDataDir = path.join(homedir(), '.config', 'tunnelbox')
  }
  return path.join(appDataDir, 'bin', `cloudflared${ext}`)
}

function run(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: 10_000 }, (err, stdout, stderr) => {
      if (err) return reject(err)
      resolve((stdout || stderr).trim())
    })
  })
}

export async function findBinary(): Promise<string | null> {
  const local = getLocalBinaryPath()
  if (fs.existsSync(local)) return local

  const whichCmd = process.platform === 'win32' ? 'where' : 'which'
  try {
    const result = await run(whichCmd, ['cloudflared'])
    if (result) return result.split('\n')[0].trim()
  } catch {
    // not found
  }
  return null
}

function parseVersion(output: string): string | null {
  const match = output.match(/(\d+\.\d+\.\d+)/)
  return match ? match[1] : null
}

function compareSemver(a: string, b: string): number {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    if (pa[i] > pb[i]) return 1
    if (pa[i] < pb[i]) return -1
  }
  return 0
}

export async function detectCloudflared(): Promise<CloudflaredEnv> {
  try {
    const binaryPath = await findBinary()
    if (!binaryPath) return { status: 'not_installed' }

    const output = await run(binaryPath, ['--version'])
    const version = parseVersion(output)

    if (!version) {
      return { status: 'error', errorMessage: 'Could not parse cloudflared version' }
    }

    if (compareSemver(version, MIN_VERSION) < 0) {
      return {
        status: 'outdated',
        version,
        errorMessage: `cloudflared version ${version} is outdated, requires ${MIN_VERSION}+`,
      }
    }

    return { status: 'available', version }
  } catch (err) {
    return {
      status: 'error',
      errorMessage: `cloudflared detection failed: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}
