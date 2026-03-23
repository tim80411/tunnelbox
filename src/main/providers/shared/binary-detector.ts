import { execFile } from 'node:child_process'
import fs from 'node:fs'
import type { ProviderEnv } from '../../../shared/provider-types'
import { parseVersion, compareSemver } from './semver'

export interface BinaryDetectorConfig {
  name: string
  minVersion: string
  localBinaryPath: string
  wellKnownPaths: string[]
  versionArgs: string[]
  versionRegex: RegExp
}

function run(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: 10_000 }, (err, stdout, stderr) => {
      if (err) return reject(err)
      resolve((stdout || stderr).trim())
    })
  })
}

export async function findBinary(config: BinaryDetectorConfig): Promise<string | null> {
  // 1. Check local install
  if (fs.existsSync(config.localBinaryPath)) {
    return config.localBinaryPath
  }

  // 2. Check well-known paths
  for (const p of config.wellKnownPaths) {
    if (fs.existsSync(p)) return p
  }

  // 3. Check PATH via `which` (unix) or `where` (windows)
  const whichCmd = process.platform === 'win32' ? 'where' : 'which'
  const binaryName = config.localBinaryPath.split('/').pop()!.replace(/\.exe$/, '')
  try {
    const result = await run(whichCmd, [binaryName])
    if (result) return result.split('\n')[0].trim()
  } catch {
    // not found on PATH
  }

  return null
}

export async function detectBinary(config: BinaryDetectorConfig): Promise<ProviderEnv> {
  try {
    const binaryPath = await findBinary(config)
    if (!binaryPath) {
      return { status: 'not_installed' }
    }

    const output = await run(binaryPath, config.versionArgs)
    const version = parseVersion(output)

    if (!version) {
      return {
        status: 'error',
        errorMessage: `無法解析 ${config.name} 版本資訊`
      }
    }

    if (compareSemver(version, config.minVersion) < 0) {
      return {
        status: 'outdated',
        version,
        errorMessage: `${config.name} 版本過舊（${version}），需要 ${config.minVersion} 以上`
      }
    }

    return { status: 'available', version }
  } catch (err) {
    return {
      status: 'error',
      errorMessage: `${config.name} 偵測失敗：${err instanceof Error ? err.message : String(err)}`
    }
  }
}
