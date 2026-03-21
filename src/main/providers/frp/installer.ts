import fs from 'node:fs'
import path from 'node:path'
import { createWriteStream } from 'node:fs'
import { net } from 'electron'
import { getLocalBinaryPath } from './detector'
import { createLogger } from '../../logger'

const log = createLogger('FrpInstaller')

/** GitHub releases base URL for frp */
const RELEASES_BASE = 'https://github.com/fatedier/frp/releases/latest/download'

/** Get the platform/arch tag used in frp release file names */
function getPlatformArch(): { os: string; arch: string } {
  const platform = process.platform
  const arch = process.arch

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
    os: osMap[platform] || 'linux',
    arch: archMap[arch] || 'amd64',
  }
}

/** Download a file using Electron's net module (respects proxy settings) */
function downloadFile(url: string, destPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = net.request(url)

    request.on('response', async (response) => {
      // Follow redirects (GitHub releases redirect to S3)
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        const redirectUrl = Array.isArray(response.headers.location)
          ? response.headers.location[0]
          : response.headers.location
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

/** Extract .tar.gz archive and find frpc binary inside */
async function extractTarGz(tgzPath: string, destDir: string, binaryName: string): Promise<string> {
  const { execFile } = await import('node:child_process')

  // frp tarballs contain a directory like "frp_0.58.1_darwin_arm64/"
  // First list contents to find the directory name
  const listOutput = await new Promise<string>((resolve, reject) => {
    execFile('tar', ['-tzf', tgzPath], (err, stdout) => {
      if (err) reject(new Error(`解壓縮失敗：${err.message}`))
      else resolve(stdout)
    })
  })

  // Find the frpc binary path within the archive
  const lines = listOutput.split('\n')
  const frpcEntry = lines.find((l) => l.endsWith(`/${binaryName}`) || l === binaryName)
  if (!frpcEntry) {
    throw new Error('壓縮檔中找不到 frpc 二進位檔')
  }

  // Extract just the frpc binary
  await new Promise<void>((resolve, reject) => {
    execFile('tar', ['-xzf', tgzPath, '-C', destDir, '--strip-components=1', frpcEntry.trim()], (err) => {
      if (err) reject(new Error(`解壓縮失敗：${err.message}`))
      else resolve()
    })
  })

  return path.join(destDir, binaryName)
}

/** Install frpc for the current platform */
export async function installFrpc(): Promise<string> {
  const binaryPath = getLocalBinaryPath()
  const binDir = path.dirname(binaryPath)
  const binaryName = process.platform === 'win32' ? 'frpc.exe' : 'frpc'

  // Ensure bin directory exists
  fs.mkdirSync(binDir, { recursive: true })

  const { os, arch } = getPlatformArch()

  // frp releases are always .tar.gz (even on Windows they provide zip, but tar.gz is universal)
  const ext = process.platform === 'win32' ? 'zip' : 'tar.gz'
  const downloadUrl = `${RELEASES_BASE}/frp_${os}_${arch}.${ext}`

  if (ext === 'tar.gz') {
    const tgzPath = path.join(binDir, 'frp.tar.gz')
    try {
      await downloadFile(downloadUrl, tgzPath)
      await extractTarGz(tgzPath, binDir, binaryName)
      // Cleanup
      fs.unlinkSync(tgzPath)
    } catch (err) {
      if (fs.existsSync(tgzPath)) fs.unlinkSync(tgzPath)
      throw err
    }
  } else {
    // Windows zip — download and extract
    const zipPath = path.join(binDir, 'frp.zip')
    try {
      await downloadFile(downloadUrl, zipPath)
      // Use tar which can handle zip on modern Windows
      const { execFile } = await import('node:child_process')
      await new Promise<void>((resolve, reject) => {
        execFile('tar', ['-xf', zipPath, '-C', binDir, '--strip-components=1'], (err) => {
          if (err) reject(new Error(`解壓縮失敗：${err.message}`))
          else resolve()
        })
      })
      fs.unlinkSync(zipPath)
    } catch (err) {
      if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath)
      throw err
    }
  }

  // Make executable on unix
  if (process.platform !== 'win32') {
    fs.chmodSync(binaryPath, 0o755)
  }

  // Verify the binary works
  const { execFile } = await import('node:child_process')
  return new Promise((resolve, reject) => {
    execFile(binaryPath, ['--version'], { timeout: 10_000 }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error('安裝的 frpc 無法執行，請嘗試手動安裝'))
        return
      }
      const output = (stdout || stderr).trim()
      log.info(`frpc installed: ${output}`)
      resolve(binaryPath)
    })
  })
}
