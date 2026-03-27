import fs from 'node:fs'
import path from 'node:path'
import { createWriteStream } from 'node:fs'
import { net } from 'electron'
import { createLogger } from '../../logger'
import { downloadAndVerifyChecksum } from './checksum'

const log = createLogger('BinaryInstaller')

export interface BinaryInstallerConfig {
  name: string
  localBinaryPath: string
  getDownloadUrl: (platform: { os: string; arch: string }) => string
  extract: (archivePath: string, destDir: string, binaryName: string) => Promise<string>
  versionArgs: string[]
  /** Optional URL to a SHA256SUMS-style checksum file for verifying the download */
  checksumUrl?: string | ((platform: { os: string; arch: string }) => string)
}

export function getPlatformArch(): { os: string; arch: string } {
  const osMap: Record<string, string> = {
    darwin: 'darwin',
    win32: 'windows',
    linux: 'linux',
  }
  const archMap: Record<string, string> = {
    x64: 'amd64',
    arm64: 'arm64',
    arm: 'arm',
  }
  return {
    os: osMap[process.platform] || 'linux',
    arch: archMap[process.arch] || 'amd64',
  }
}

export function downloadFile(url: string, destPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = net.request(url)

    request.on('response', async (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        const redirectUrl = Array.isArray(response.headers.location)
          ? response.headers.location[0]
          : response.headers.location
        if (!redirectUrl.startsWith('https://')) {
          reject(new Error(`安全性錯誤：拒絕重新導向至非 HTTPS 網址：${redirectUrl}`))
          return
        }
        try {
          await downloadFile(redirectUrl, destPath)
          resolve()
        } catch (err) {
          reject(err)
        }
        return
      }

      if (response.statusCode !== 200) {
        reject(new Error(`下載失敗（HTTP ${response.statusCode}）`))
        return
      }

      const writeStream = createWriteStream(destPath)
      response.on('data', (chunk: Buffer) => {
        writeStream.write(chunk)
      })
      response.on('end', () => {
        writeStream.end(() => resolve())
      })
      response.on('error', (err) => {
        writeStream.destroy()
        reject(new Error(`寫入檔案失敗：${err instanceof Error ? err.message : String(err)}`))
      })
    })

    request.on('error', (err) => {
      reject(new Error(`網路連線失敗：${err.message}`))
    })

    request.end()
  })
}

export async function extractTarGz(tgzPath: string, destDir: string, binaryName: string): Promise<string> {
  const { execFile } = await import('node:child_process')

  const listOutput = await new Promise<string>((resolve, reject) => {
    execFile('tar', ['-tzf', tgzPath], (err, stdout) => {
      if (err) reject(new Error(`解壓縮失敗：${err.message}`))
      else resolve(stdout)
    })
  })

  const lines = listOutput.split('\n')
  const entry = lines.find((l) => l.endsWith(`/${binaryName}`) || l === binaryName)
  if (!entry) {
    throw new Error(`壓縮檔中找不到 ${binaryName}`)
  }

  await new Promise<void>((resolve, reject) => {
    execFile('tar', ['-xzf', tgzPath, '-C', destDir, '--strip-components=1', entry.trim()], (err) => {
      if (err) reject(new Error(`解壓縮失敗：${err.message}`))
      else resolve()
    })
  })

  return path.join(destDir, binaryName)
}

export async function installBinary(config: BinaryInstallerConfig): Promise<string> {
  const binaryPath = config.localBinaryPath
  const binDir = path.dirname(binaryPath)
  const binaryName = path.basename(binaryPath)

  fs.mkdirSync(binDir, { recursive: true })

  const platform = getPlatformArch()
  const downloadUrl = config.getDownloadUrl(platform)

  const ext = downloadUrl.endsWith('.zip') ? 'zip' : 'tar.gz'
  const archivePath = path.join(binDir, `${config.name}.${ext}`)

  try {
    await downloadFile(downloadUrl, archivePath)

    // Verify checksum if configured
    if (config.checksumUrl) {
      const checksumUrl = typeof config.checksumUrl === 'function'
        ? config.checksumUrl(platform)
        : config.checksumUrl
      const archiveFilename = path.basename(downloadUrl)
      await downloadAndVerifyChecksum(archivePath, checksumUrl, archiveFilename)
    }

    await config.extract(archivePath, binDir, binaryName)
    fs.unlinkSync(archivePath)
  } catch (err) {
    if (fs.existsSync(archivePath)) fs.unlinkSync(archivePath)
    throw err
  }

  if (process.platform !== 'win32') {
    fs.chmodSync(binaryPath, 0o755)
  }

  // Verify the binary works
  const { execFile } = await import('node:child_process')
  return new Promise((resolve, reject) => {
    execFile(binaryPath, config.versionArgs, { timeout: 10_000 }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(`安裝的 ${config.name} 無法執行，請嘗試手動安裝`))
        return
      }
      const output = (stdout || stderr).trim()
      log.info(`${config.name} installed: ${output}`)
      resolve(binaryPath)
    })
  })
}
