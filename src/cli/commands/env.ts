import type { Command } from 'commander'
import type { CloudflaredEnv } from '../../shared/types'
import { output } from '../output'

export interface EnvCheckResult {
  installed: boolean
  status: string
  version?: string
  errorMessage?: string
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
 * Register env commands with commander.
 */
export function registerEnvCommands(
  program: Command,
  detectFn: () => Promise<CloudflaredEnv>
): void {
  const env = program.command('env').description('Check environment dependencies')

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
}
