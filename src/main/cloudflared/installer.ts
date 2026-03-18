import fs from 'node:fs'
import path from 'node:path'
import { createWriteStream } from 'node:fs'
import { net } from 'electron'
import { getLocalBinaryPath } from './detector'

/** GitHub releases base URL for cloudflared */
const RELEASES_BASE = 'https://github.com/cloudflare/cloudflared/releases/latest/download'

/** Get the platform-specific download URL */
function getDownloadUrl(): string {
  const platform = process.platform
  const arch = process.arch

  if (platform === 'darwin') {
    return arch === 'arm64'
      ? `${RELEASES_BASE}/cloudflared-darwin-arm64.tgz`
      : `${RELEASES_BASE}/cloudflared-darwin-amd64.tgz`
  }

  if (platform === 'win32') {
    return arch === 'arm64'
      ? `${RELEASES_BASE}/cloudflared-windows-arm64.exe`
      : `${RELEASES_BASE}/cloudflared-windows-amd64.exe`
  }

  // Linux
  if (arch === 'arm64') return `${RELEASES_BASE}/cloudflared-linux-arm64`
  if (arch === 'arm') return `${RELEASES_BASE}/cloudflared-linux-arm`
  return `${RELEASES_BASE}/cloudflared-linux-amd64`
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

/** Extract .tgz archive (macOS ships as tgz) */
async function extractTgz(tgzPath: string, destDir: string): Promise<void> {
  const { execFile } = await import('node:child_process')
  return new Promise((resolve, reject) => {
    execFile('tar', ['-xzf', tgzPath, '-C', destDir], (err) => {
      if (err) reject(new Error(`解壓縮失敗：${err.message}`))
      else resolve()
    })
  })
}

/** Install cloudflared for the current platform */
export async function installCloudflared(): Promise<string> {
  const binaryPath = getLocalBinaryPath()
  const binDir = path.dirname(binaryPath)

  // Ensure bin directory exists
  fs.mkdirSync(binDir, { recursive: true })

  const downloadUrl = getDownloadUrl()
  const isTgz = downloadUrl.endsWith('.tgz')

  if (isTgz) {
    // macOS: download tgz, extract
    const tgzPath = path.join(binDir, 'cloudflared.tgz')
    try {
      await downloadFile(downloadUrl, tgzPath)
      await extractTgz(tgzPath, binDir)
      // Cleanup tgz
      fs.unlinkSync(tgzPath)
    } catch (err) {
      // Cleanup on failure
      if (fs.existsSync(tgzPath)) fs.unlinkSync(tgzPath)
      throw err
    }
  } else {
    // Windows/Linux: download binary directly
    await downloadFile(downloadUrl, binaryPath)
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
        reject(new Error('安裝的 cloudflared 無法執行，請嘗試手動安裝'))
        return
      }
      const output = (stdout || stderr).trim()
      console.log(`[Installer] cloudflared installed: ${output}`)
      resolve(binaryPath)
    })
  })
}
