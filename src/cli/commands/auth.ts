import type { Command } from 'commander'
import type { CloudflareAuth } from '../../shared/types'
import { CLIError } from '../errors'
import { output } from '../output'

export interface AuthDeps {
  login: () => Promise<CloudflareAuth>
  getStatus: () => Promise<CloudflareAuth>
  logout: () => Promise<void>
}

export interface AuthLoginResult {
  status: string
  message: string
}

export interface AuthStatusResult {
  loggedIn: boolean
  status: string
}

export interface AuthLogoutResult {
  message: string
}

/**
 * Login to Cloudflare via OAuth.
 */
export async function authLogin(deps: AuthDeps): Promise<AuthLoginResult> {
  const current = await deps.getStatus()
  if (current.status === 'logged_in') {
    return { status: 'already_logged_in', message: 'Already logged in' }
  }

  try {
    await deps.login()
    return { status: 'success', message: 'Login successful' }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('逾時') || msg.includes('timed out') || msg.includes('取消')) {
      throw CLIError.system('Login timed out')
    }
    throw CLIError.system(`Login failed: ${msg}`)
  }
}

/**
 * Check auth status.
 */
export async function authStatus(deps: AuthDeps): Promise<AuthStatusResult> {
  const auth = await deps.getStatus()
  return {
    loggedIn: auth.status === 'logged_in',
    status: auth.status,
  }
}

/**
 * Logout from Cloudflare.
 */
export async function authLogout(deps: AuthDeps): Promise<AuthLogoutResult> {
  const current = await deps.getStatus()
  if (current.status !== 'logged_in') {
    return { message: 'Not logged in' }
  }

  await deps.logout()
  return { message: 'Logged out successfully' }
}

/**
 * Register auth commands with commander.
 */
export function registerAuthCommands(
  program: Command,
  getDeps: () => AuthDeps
): void {
  const auth = program.command('auth').description('Manage Cloudflare authentication')

  auth
    .command('login')
    .description('Login to Cloudflare via OAuth')
    .action(async () => {
      const json = program.opts().json
      try {
        const result = await authLogin(getDeps())
        output(json ? result : result.message, json)
      } catch (err) {
        const { handleError } = await import('../errors')
        handleError(err, json)
      }
    })

  auth
    .command('status')
    .description('Check Cloudflare authentication status')
    .action(async () => {
      const json = program.opts().json
      try {
        const result = await authStatus(getDeps())
        if (json) {
          output(result, true)
        } else {
          output(result.loggedIn ? 'Logged in' : 'Not logged in', false)
        }
      } catch (err) {
        const { handleError } = await import('../errors')
        handleError(err, json)
      }
    })

  auth
    .command('logout')
    .description('Logout from Cloudflare')
    .action(async () => {
      const json = program.opts().json
      try {
        const result = await authLogout(getDeps())
        output(json ? result : result.message, json)
      } catch (err) {
        const { handleError } = await import('../errors')
        handleError(err, json)
      }
    })
}
