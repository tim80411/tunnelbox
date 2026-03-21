import type { Command } from 'commander'
import type { CloudflaredEnv } from '../../shared/types'
import { output } from '../output'

export interface EnvCheckResult {
  installed: boolean
  status: string
  version?: string
  errorMessage?: string
}

export interface EnvInstallResult {
  installed: boolean
  alreadyInstalled?: boolean
  version?: string
}

export interface EnvInstallDeps {
  install: () => Promise<{ installed: boolean; version?: string }>
}

/**
 * Check cloudflared installation status.
 * Takes a detect function as parameter for testability (avoids Electron imports).
 */
export async function envCheck(
  detectFn: () => Promise<CloudflaredEnv>
): Promise<EnvCheckResult> {
  const env = await detectFn()

  const installed = env.status === 'available' || env.status === 'outdated'

  const result: EnvCheckResult = {
    installed,
    status: env.status,
  }

  if (env.version) result.version = env.version
  if (env.errorMessage) result.errorMessage = env.errorMessage

  return result
}

/**
 * Install cloudflared.
 */
export async function envInstall(
  detectFn: () => Promise<CloudflaredEnv>,
  installDeps: EnvInstallDeps
): Promise<EnvInstallResult> {
  // Check if already installed
  const current = await detectFn()
  if (current.status === 'available') {
    return { installed: true, alreadyInstalled: true, version: current.version }
  }

  const res = await installDeps.install()
  return { installed: res.installed, version: res.version }
}

/**
 * Register env commands with commander.
 */
export function registerEnvCommands(
  program: Command,
  detectFn: () => Promise<CloudflaredEnv>,
  getInstallDeps?: () => EnvInstallDeps
): void {
  const env = program.command('env').description('Manage environment dependencies')

  env
    .command('check')
    .description('Check if cloudflared is installed')
    .action(async () => {
      const json = program.opts().json
      try {
        const result = await envCheck(detectFn)

        if (json) {
          output(result, true)
        } else if (result.installed) {
          output(`cloudflared: installed (version ${result.version})`, false)
          if (result.status === 'outdated') {
            console.log(`Warning: ${result.errorMessage}`)
          }
        } else {
          output('cloudflared: not installed', false)
          console.log('Hint: Use `tunnelbox env install` to install cloudflared')
        }
      } catch (err) {
        const { handleError } = await import('../errors')
        handleError(err, json)
      }
    })

  env
    .command('install')
    .description('Install cloudflared')
    .action(async () => {
      const json = program.opts().json
      try {
        if (!getInstallDeps) {
          const { handleError } = await import('../errors')
          const { CLIError } = await import('../errors')
          handleError(CLIError.system('TunnelBox app is not running. Please open TunnelBox first.'), json)
        }
        const result = await envInstall(detectFn, getInstallDeps!())

        if (json) {
          output(result, true)
        } else if (result.alreadyInstalled) {
          output(`cloudflared already installed (version ${result.version})`, false)
        } else {
          output(`cloudflared installed successfully${result.version ? ` (version ${result.version})` : ''}`, false)
        }
      } catch (err) {
        const { handleError } = await import('../errors')
        handleError(err, json)
      }
    })
}
