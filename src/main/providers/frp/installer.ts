import { getLocalBinaryPath } from './detector'
import { installBinary, extractTarGz } from '../shared/binary-installer'
import type { BinaryInstallerConfig } from '../shared/binary-installer'

const RELEASES_BASE = 'https://github.com/fatedier/frp/releases/latest/download'

function getFrpInstallerConfig(): BinaryInstallerConfig {
  const binaryPath = getLocalBinaryPath()
  return {
    name: 'frpc',
    localBinaryPath: binaryPath,
    getDownloadUrl: (platform) => {
      const ext = process.platform === 'win32' ? 'zip' : 'tar.gz'
      return `${RELEASES_BASE}/frp_${platform.os}_${platform.arch}.${ext}`
    },
    extract: async (archivePath, destDir, binaryName) => {
      if (archivePath.endsWith('.zip')) {
        const { execFile } = await import('node:child_process')
        await new Promise<void>((resolve, reject) => {
          execFile('tar', ['-xf', archivePath, '-C', destDir, '--strip-components=1'], (err) => {
            if (err) reject(new Error(`解壓縮失敗：${err.message}`))
            else resolve()
          })
        })
        const path = await import('node:path')
        return path.join(destDir, binaryName)
      }
      return extractTarGz(archivePath, destDir, binaryName)
    },
    versionArgs: ['--version']
  }
}

export async function installFrpc(): Promise<string> {
  return installBinary(getFrpInstallerConfig())
}
