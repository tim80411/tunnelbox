import { BrowserWindow } from 'electron'
import { execFile } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { findBinary } from './detector'
import { createLogger } from '../logger'
import * as siteStore from '../store'
import type { CloudflareAuth } from '../../shared/types'

const log = createLogger('AuthManager')

/** Default cloudflared cert location */
function getCertPath(): string {
  return path.join(os.homedir(), '.cloudflared', 'cert.pem')
}

/**
 * Get the current auth status by checking if cert.pem exists.
 */
export function getAuthStatus(): CloudflareAuth {
  const stored = siteStore.getAuth()
  const certPath = stored?.certPath || getCertPath()

  if (!fs.existsSync(certPath)) {
    return { status: 'logged_out' }
  }

  return {
    status: 'logged_in',
    accountEmail: stored?.accountEmail,
    accountId: stored?.accountId
  }
}

/**
 * Login to Cloudflare via `cloudflared tunnel login`.
 * Opens browser for OAuth, waits for cert.pem creation.
 */
export async function login(): Promise<CloudflareAuth> {
  const binaryPath = await findBinary()
  if (!binaryPath) {
    throw new Error('cloudflared 尚未安裝，請先安裝 cloudflared')
  }

  broadcastAuthStatus({ status: 'logging_in' })

  return new Promise<CloudflareAuth>((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill()
      broadcastAuthStatus({ status: 'logged_out' })
      reject(new Error('認證已取消或逾時'))
    }, 120_000) // 2 minute timeout

    const child = execFile(binaryPath, ['tunnel', 'login'], { timeout: 120_000 }, (err) => {
      clearTimeout(timeout)

      if (err) {
        broadcastAuthStatus({ status: 'logged_out' })
        if (err.killed || err.signal === 'SIGTERM') {
          reject(new Error('認證已取消'))
          return
        }
        reject(new Error(`認證失敗：${err.message}`))
        return
      }

      // Login succeeded - cert.pem should now exist
      const certPath = getCertPath()
      if (!fs.existsSync(certPath)) {
        broadcastAuthStatus({ status: 'logged_out' })
        reject(new Error('認證失敗：未找到認證憑證'))
        return
      }

      // Persist auth info
      siteStore.saveAuth({ certPath })

      const auth: CloudflareAuth = {
        status: 'logged_in'
      }
      broadcastAuthStatus(auth)
      resolve(auth)
    })
  })
}

/**
 * Logout from Cloudflare. Deletes cert.pem and clears stored auth.
 */
export function logout(): void {
  const stored = siteStore.getAuth()
  const certPath = stored?.certPath || getCertPath()

  // Delete cert file
  if (fs.existsSync(certPath)) {
    try {
      fs.unlinkSync(certPath)
    } catch (err) {
      log.error('Failed to delete cert:', err)
    }
  }

  siteStore.clearAuth()
  broadcastAuthStatus({ status: 'logged_out' })
}

function broadcastAuthStatus(auth: CloudflareAuth): void {
  const windows = BrowserWindow.getAllWindows()
  for (const win of windows) {
    win.webContents.send('auth-status-changed', auth)
  }
}
