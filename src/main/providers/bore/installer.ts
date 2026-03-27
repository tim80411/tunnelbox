import { getLocalBinaryPath } from './detector'
import { installBinary, extractTarGz } from '../shared/binary-installer'
import type { BinaryInstallerConfig } from '../shared/binary-installer'

/**
 * bore release assets contain the version in the filename (e.g., bore-v0.6.0-x86_64-apple-darwin.tar.gz).
 * We fetch the latest tag first, then construct the download URL.
 */
const LATEST_TAG_URL = 'https://api.github.com/repos/ekzhang/bore/releases/latest'

async function fetchLatestTag(): Promise<string> {
  const { net } = await import('electron')
  return new Promise((resolve, reject) => {
    const request = net.request(LATEST_TAG_URL)
    let body = ''
    request.on('response', (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`無法取得 bore 最新版本（HTTP ${response.statusCode}）`))
        return
      }
      response.on('data', (chunk: Buffer) => { body += chunk.toString() })
      response.on('end', () => {
        try {
          const data = JSON.parse(body)
          resolve(data.tag_name)
        } catch {
          reject(new Error('無法解析 bore 版本資訊'))
        }
      })
    })
    request.on('error', (err) => reject(new Error(`網路連線失敗：${err.message}`)))
    request.end()
  })
}

function getTarget(platform: { os: string; arch: string }): string {
  const archMap: Record<string, string> = {
    amd64: 'x86_64',
    arm64: 'aarch64',
    arm: 'arm',
  }
  const rustArch = archMap[platform.arch] || 'x86_64'

  if (platform.os === 'darwin') return `${rustArch}-apple-darwin`
  if (platform.os === 'windows') return `${rustArch}-pc-windows-msvc`
  return `${rustArch}-unknown-linux-musl`
}

let cachedTag: string | null = null

function getBoreInstallerConfig(tag: string): BinaryInstallerConfig {
  return {
    name: 'bore',
    localBinaryPath: getLocalBinaryPath(),
    getDownloadUrl: (platform) => {
      const target = getTarget(platform)
      const ext = platform.os === 'windows' ? 'zip' : 'tar.gz'
      return `https://github.com/ekzhang/bore/releases/download/${tag}/bore-${tag}-${target}.${ext}`
    },
    checksumUrl: `https://github.com/ekzhang/bore/releases/download/${tag}/bore-checksums.txt`,
    extract: async (archivePath, destDir, binaryName) => {
      if (archivePath.endsWith('.zip')) {
        const { execFile } = await import('node:child_process')
        await new Promise<void>((resolve, reject) => {
          execFile('tar', ['-xf', archivePath, '-C', destDir], (err) => {
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

export async function installBore(): Promise<string> {
  if (!cachedTag) {
    cachedTag = await fetchLatestTag()
  }
  return installBinary(getBoreInstallerConfig(cachedTag))
}
