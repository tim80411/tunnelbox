import crypto from 'node:crypto'
import fs from 'node:fs'
import { net } from 'electron'
import { createLogger } from '../../logger'

const log = createLogger('Checksum')

/** Download text content from a URL (follows HTTPS-only redirects) */
export function downloadText(url: string): Promise<string> {
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
          const text = await downloadText(redirectUrl)
          resolve(text)
        } catch (err) {
          reject(err)
        }
        return
      }

      if (response.statusCode !== 200) {
        reject(new Error(`下載校驗檔失敗（HTTP ${response.statusCode}）`))
        return
      }

      let body = ''
      response.on('data', (chunk: Buffer) => {
        body += chunk.toString()
      })
      response.on('end', () => {
        resolve(body)
      })
      response.on('error', (err) => {
        reject(new Error(`下載校驗檔失敗：${err instanceof Error ? err.message : String(err)}`))
      })
    })

    request.on('error', (err) => {
      reject(new Error(`網路連線失敗：${err.message}`))
    })

    request.end()
  })
}

/** Compute SHA256 hash of a file */
export function computeSha256(filePath: string): string {
  const fileBuffer = fs.readFileSync(filePath)
  return crypto.createHash('sha256').update(fileBuffer).digest('hex')
}

/** Verify that a file matches the expected SHA256 hash */
export function verifyChecksum(filePath: string, expectedHash: string): boolean {
  const actualHash = computeSha256(filePath)
  return actualHash.toLowerCase() === expectedHash.toLowerCase()
}

/**
 * Parse a SHA256SUMS-style checksum file and find the hash for a given filename.
 * Supports formats like:
 *   <hash>  <filename>
 *   <hash> <filename>
 */
export function parseChecksumFile(content: string, targetFilename: string): string | null {
  const lines = content.split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    // Format: "<hash>  <filename>" or "<hash> <filename>"
    const match = trimmed.match(/^([0-9a-fA-F]{64})\s+(.+)$/)
    if (match) {
      const [, hash, filename] = match
      // Match by exact filename or basename (some checksum files include paths)
      if (filename === targetFilename || filename.endsWith(`/${targetFilename}`)) {
        return hash
      }
    }
  }
  return null
}

/**
 * Download a checksum file, find the expected hash for a target filename,
 * and verify the downloaded file matches.
 * Throws on mismatch or if the target filename is not found in the checksum file.
 */
export async function downloadAndVerifyChecksum(
  filePath: string,
  checksumUrl: string,
  targetFilename: string,
): Promise<void> {
  log.info(`Downloading checksum file: ${checksumUrl}`)
  const checksumContent = await downloadText(checksumUrl)

  const expectedHash = parseChecksumFile(checksumContent, targetFilename)
  if (!expectedHash) {
    throw new Error(`校驗檔中找不到 ${targetFilename} 的雜湊值`)
  }

  const actualHash = computeSha256(filePath)
  if (actualHash.toLowerCase() !== expectedHash.toLowerCase()) {
    // Delete the corrupted/tampered file
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
    }
    throw new Error(
      `SHA256 校驗失敗：檔案可能已損毀或遭竄改\n` +
      `  預期：${expectedHash}\n` +
      `  實際：${actualHash}`,
    )
  }

  log.info(`Checksum verified for ${targetFilename}: ${actualHash}`)
}
