import { app, BrowserWindow, session } from 'electron'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { findBinary } from './detector'
import { createLogger } from '../logger'
import * as siteStore from '../store'
import { tierGate } from '../license/tier-gate'
import type { CloudflareAccount, CloudflareAccountsState } from '../../shared/types'

const log = createLogger('AccountManager')

const OAUTH_URL_PATTERN = /https:\/\/dash\.cloudflare\.com\/argotunnel\?[^\s]+/
const OAUTH_TIMEOUT_MS = 120_000

/**
 * Run `cloudflared tunnel login` with the OAuth URL opened inside an isolated
 * Electron BrowserWindow (per-call `persist:cf-oauth-<ts>` partition) rather
 * than the user's default browser. This way:
 *   - Each addAccount() call uses a clean cookie jar — user can authorize a
 *     different Cloudflare identity without first logging out in their main browser.
 *   - The system browser never opens (we set BROWSER=/bin/true so cloudflared's
 *     pkg/browser exec'es a no-op).
 * Window closes automatically on cloudflared exit; killing it from the UI cancels
 * the spawned cloudflared process.
 */
export async function performCloudflaredLogin(binaryPath: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let resolved = false
    let oauthWindow: BrowserWindow | null = null

    // PATH='' forces cloudflared's OpenBrowser() to fail ENOENT (open/xdg-open/start
     // unfindable). cloudflared's source explicitly handles that as non-fatal: it prints
    // the URL to stderr and keeps polling for the cert. We catch that URL ourselves and
    // open it in an isolated Electron BrowserWindow instead — no system browser tab.
    const child = spawn(binaryPath, ['tunnel', 'login'], {
      env: { ...process.env, PATH: '' }
    })

    const timeout = setTimeout(() => {
      if (resolved) return
      child.kill()
      finish(() => reject(new Error('認證已取消或逾時')))
    }, OAUTH_TIMEOUT_MS)

    const finish = (action: () => void): void => {
      if (resolved) return
      resolved = true
      clearTimeout(timeout)
      if (oauthWindow && !oauthWindow.isDestroyed()) {
        oauthWindow.removeAllListeners('closed')
        oauthWindow.close()
      }
      action()
    }

    child.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf8')
      const match = text.match(OAUTH_URL_PATTERN)
      if (match && !oauthWindow) {
        openOAuthWindow(match[0])
      }
    })

    child.stderr.on('data', (chunk: Buffer) => {
      // cloudflared writes URL hints to stderr in some versions
      const text = chunk.toString('utf8')
      const match = text.match(OAUTH_URL_PATTERN)
      if (match && !oauthWindow) {
        openOAuthWindow(match[0])
      }
    })

    child.on('exit', (code, signal) => {
      if (signal === 'SIGTERM' || signal === 'SIGKILL') {
        finish(() => reject(new Error('認證已取消')))
        return
      }
      if (code === 0) {
        finish(() => resolve())
      } else {
        finish(() => reject(new Error(`認證失敗：cloudflared 結束碼 ${code}`)))
      }
    })

    child.on('error', (err) => {
      finish(() => reject(new Error(`認證失敗：${err.message}`)))
    })

    function openOAuthWindow(url: string): void {
      const partitionName = `persist:cf-oauth-${Date.now()}`
      // session.fromPartition creates the partition lazily; storage starts empty.
      const isolated = session.fromPartition(partitionName)
      // Defensive clear in case a previous run reused this timestamp millisecond.
      isolated.clearStorageData().catch(() => { /* ignore */ })

      oauthWindow = new BrowserWindow({
        width: 1000,
        height: 720,
        title: 'Cloudflare 帳號登入',
        autoHideMenuBar: true,
        webPreferences: {
          partition: partitionName,
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true
        }
      })
      oauthWindow.loadURL(url).catch((err) => {
        log.warn('Failed to load OAuth URL', err)
      })

      oauthWindow.on('closed', () => {
        oauthWindow = null
        if (resolved) return
        // User closed the window before cloudflared finished — treat as cancel.
        child.kill()
        finish(() => reject(new Error('認證已取消')))
      })
    }
  })
}

export function parseArgoCertEnvelope(certPath: string): { cfAccountId: string; apiToken: string } | null {
  try {
    const raw = fs.readFileSync(certPath, 'utf8')
    const match = raw.match(/-----BEGIN ARGO TUNNEL TOKEN-----\r?\n([\s\S]+?)\r?\n-----END ARGO TUNNEL TOKEN-----/)
    if (!match) return null
    const b64 = match[1].replace(/\s/g, '')
    const json = Buffer.from(b64, 'base64').toString('utf8')
    const parsed = JSON.parse(json) as Record<string, unknown>
    const cfAccountId = typeof parsed.accountID === 'string' ? parsed.accountID : null
    const apiToken = typeof parsed.apiToken === 'string' ? parsed.apiToken : null
    if (!cfAccountId || !apiToken) return null
    return { cfAccountId, apiToken }
  } catch {
    return null
  }
}

/**
 * Fetch the human-readable Cloudflare account name via the accounts endpoint.
 *
 * The cloudflared-issued token (cfut_…) lacks `user:read` scope so the `/user`
 * endpoint returns 9109 Unauthorized. The accounts endpoint is allowed and
 * returns a name like `"<email>'s Account"` by default (or whatever the user
 * renamed it to on the CF dashboard).
 */
export async function fetchCfAccountName(apiToken: string, cfAccountId: string): Promise<string | null> {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 5_000)
    const resp = await fetch(`https://api.cloudflare.com/client/v4/accounts/${cfAccountId}`, {
      headers: { Authorization: `Bearer ${apiToken}` },
      signal: controller.signal
    })
    clearTimeout(timer)
    if (!resp.ok) return null
    const data = await resp.json() as { success?: boolean; result?: { name?: string } }
    if (!data.success) return null
    return data.result?.name ?? null
  } catch {
    return null
  }
}

function certDir(): string {
  try {
    return path.join(app.getPath('userData'), 'cloudflared-accounts')
  } catch {
    return path.join(os.homedir(), '.tunnelbox', 'cloudflared-accounts')
  }
}

function certPathForId(accountId: string): string {
  return path.join(certDir(), `cert-${accountId}.pem`)
}

function ensureCertDir(): void {
  const dir = certDir()
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

function generateAccountId(): string {
  return `acct-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function broadcastAccountsState(state: CloudflareAccountsState): void {
  const windows = BrowserWindow.getAllWindows()
  for (const win of windows) {
    win.webContents.send('cf-accounts-changed', state)
  }
}

export function getAccountsState(): CloudflareAccountsState {
  return siteStore.getCfAccounts()
}

export function getActiveCert(): string | null {
  const { accounts, activeAccountId } = siteStore.getCfAccounts()
  if (!activeAccountId) return null
  const account = accounts.find((a) => a.id === activeAccountId)
  if (!account) return null
  return fs.existsSync(account.certPath) ? account.certPath : null
}

export function getCertForSite(siteId: string): string | null {
  const boundId = siteStore.getSiteCfAccountId(siteId)
  const { accounts, activeAccountId } = siteStore.getCfAccounts()

  const resolvedId = (boundId !== null && boundId !== undefined) ? boundId : activeAccountId
  if (!resolvedId) return null

  const account = accounts.find((a) => a.id === resolvedId)
  if (!account) return getActiveCert()
  return fs.existsSync(account.certPath) ? account.certPath : null
}

/**
 * Backfill cfAccountId for any stored account whose envelope was previously
 * unparseable (e.g. before the regex fix). Reads each cert.pem in-place and
 * updates only the missing field. Idempotent and best-effort.
 */
function backfillCfAccountIds(state: CloudflareAccountsState): CloudflareAccountsState {
  let changed = false
  const updated = state.accounts.map((a) => {
    if (a.cfAccountId || !fs.existsSync(a.certPath)) return a
    const env = parseArgoCertEnvelope(a.certPath)
    if (!env) return a
    changed = true
    return { ...a, cfAccountId: env.cfAccountId }
  })
  if (!changed) return state
  const next = { accounts: updated, activeAccountId: state.activeAccountId }
  siteStore.saveCfAccounts(next)
  return next
}

export async function addAccount(): Promise<CloudflareAccountsState> {
  const binaryPath = await findBinary()
  if (!binaryPath) throw new Error('cloudflared 尚未安裝，請先安裝 cloudflared')

  const { accounts, activeAccountId } = backfillCfAccountIds(siteStore.getCfAccounts())

  if (!tierGate.isPro() && accounts.length >= 1) {
    throw new Error('FREE_ACCOUNT_LIMIT')
  }

  ensureCertDir()
  const accountId = generateAccountId()
  const certPath = certPathForId(accountId)

  // `tunnel login` does not accept --origincert; cert always lands at ~/.cloudflared/cert.pem.
  // Pre-clean any stale cert from a previous run (cloudflared refuses to login if it exists)
  // then run login, then move the cert to our per-account path.
  const defaultCertPath = path.join(os.homedir(), '.cloudflared', 'cert.pem')
  if (fs.existsSync(defaultCertPath)) {
    try { fs.unlinkSync(defaultCertPath) } catch { /* non-fatal */ }
  }

  await performCloudflaredLogin(binaryPath)

  if (!fs.existsSync(defaultCertPath)) {
    throw new Error('認證失敗：未找到認證憑證')
  }
  try {
    fs.copyFileSync(defaultCertPath, certPath)
    // Delete source so the next addAccount() call isn't blocked by "existing cert"
    fs.unlinkSync(defaultCertPath)
  } catch (copyErr) {
    throw new Error(`認證失敗：無法儲存憑證 — ${copyErr instanceof Error ? copyErr.message : copyErr}`)
  }

  // Parse cert to identify which CF account this is. If we can identify it and
  // it duplicates an existing account, refuse to add — the user almost certainly
  // intended a different identity (and just didn't switch CF login in their browser).
  let email: string | undefined
  let cfAccountId: string | undefined
  const envelope = parseArgoCertEnvelope(certPath)
  if (envelope) {
    cfAccountId = envelope.cfAccountId
    const duplicate = accounts.find((a) => a.cfAccountId === envelope.cfAccountId)
    if (duplicate) {
      try { fs.unlinkSync(certPath) } catch { /* ignore */ }
      const dupLabel = duplicate.customLabel || duplicate.email || duplicate.cfAccountId?.slice(0, 8) || duplicate.id
      throw new Error(`DUPLICATE_CF_ACCOUNT:${dupLabel}`)
    }
    const fetched = await fetchCfAccountName(envelope.apiToken, envelope.cfAccountId)
    if (fetched) email = fetched
  }

  const newAccount: CloudflareAccount = {
    id: accountId,
    certPath,
    lastUsedAt: new Date().toISOString(),
    ...(email !== undefined && { email }),
    ...(cfAccountId !== undefined && { cfAccountId })
  }

  const updated = {
    accounts: [...accounts, newAccount],
    activeAccountId: activeAccountId ?? accountId
  }
  siteStore.saveCfAccounts(updated)
  broadcastAccountsState(updated)
  return updated
}

export function setAccountLabel(accountId: string, label: string | null): CloudflareAccountsState {
  const { accounts, activeAccountId } = siteStore.getCfAccounts()
  const idx = accounts.findIndex((a) => a.id === accountId)
  if (idx === -1) throw new Error('帳號不存在')

  const updated = accounts.map((a) => {
    if (a.id !== accountId) return a
    const { customLabel: _removed, ...rest } = a
    return label ? { ...rest, customLabel: label } : rest
  })

  const state: CloudflareAccountsState = { accounts: updated, activeAccountId }
  siteStore.saveCfAccounts(state)
  broadcastAccountsState(state)
  return state
}

export function setActiveAccount(accountId: string): CloudflareAccountsState {
  const { accounts } = siteStore.getCfAccounts()
  if (!accounts.find((a) => a.id === accountId)) {
    throw new Error('帳號不存在')
  }

  const updated = accounts.map((a) =>
    a.id === accountId ? { ...a, lastUsedAt: new Date().toISOString() } : a
  )
  const state = { accounts: updated, activeAccountId: accountId }
  siteStore.saveCfAccounts(state)
  broadcastAccountsState(state)
  return state
}

export function removeAccount(accountId: string): CloudflareAccountsState {
  const { accounts, activeAccountId } = siteStore.getCfAccounts()
  const account = accounts.find((a) => a.id === accountId)
  if (!account) throw new Error('帳號不存在')

  // Delete cert file — scenario 3 spec: "cert.pem 移除 / API token 撤銷"
  if (fs.existsSync(account.certPath)) {
    try {
      fs.unlinkSync(account.certPath)
    } catch (err) {
      log.error('Failed to delete cert for account', accountId, err)
    }
  }

  // Unbind sites that were bound to this account
  const sites = siteStore.getSites()
  for (const site of sites) {
    if (site.cloudflareAccountId === accountId) {
      siteStore.updateSite(site.id, { cloudflareAccountId: null })
    }
  }

  const remaining = accounts.filter((a) => a.id !== accountId)
  const newActiveId = activeAccountId === accountId
    ? (remaining.length > 0 ? remaining.sort((a, b) => b.lastUsedAt.localeCompare(a.lastUsedAt))[0].id : null)
    : activeAccountId

  const state: CloudflareAccountsState = { accounts: remaining, activeAccountId: newActiveId }
  siteStore.saveCfAccounts(state)
  broadcastAccountsState(state)
  return state
}

export function setSiteAccount(siteId: string, accountId: string | null): void {
  siteStore.updateSite(siteId, { cloudflareAccountId: accountId })
}

export function getBoundSiteIds(accountId: string): string[] {
  return siteStore.getSites()
    .filter((s) => s.cloudflareAccountId === accountId)
    .map((s) => s.id)
}

export function applyDowngradeToFree(): void {
  const { accounts, activeAccountId } = siteStore.getCfAccounts()
  if (accounts.length <= 1) return

  // Keep only the most-recently-used account; preserve OAuth state (don't delete certs)
  const sorted = [...accounts].sort((a, b) => b.lastUsedAt.localeCompare(a.lastUsedAt))
  const keepId = activeAccountId ?? sorted[0].id
  const keepAccount = accounts.find((a) => a.id === keepId) ?? sorted[0]

  const state: CloudflareAccountsState = {
    accounts: accounts, // keep all data per spec (data preservation invariant)
    activeAccountId: keepAccount.id
  }
  siteStore.saveCfAccounts(state)
  broadcastAccountsState(state)
}
