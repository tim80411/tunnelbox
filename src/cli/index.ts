#!/usr/bin/env node
import { Command } from 'commander'
import { handleError, CLIError } from './errors'
import { FileStore } from '../core/store-file'
import { ServerManager } from '../main/server-manager'
import { registerSiteCommands } from './commands/site'
import { registerServerCommands } from './commands/server'
import { registerEnvCommands } from './commands/env'
import { registerTunnelCommands } from './commands/tunnel'
import { registerAuthCommands } from './commands/auth'
import { registerDomainCommands } from './commands/domain'
import { detectCloudflared, findBinary } from './cloudflared-cli'
import {
  isElectronRunning,
  createElectronApiClient,
  createElectronAuthClient,
  createElectronDomainClient,
  createElectronEnvClient,
} from './electron-api-client'
import type { TunnelDeps } from './commands/tunnel'
import type { AuthDeps } from './commands/auth'
import type { DomainDeps } from './commands/domain'
import type { EnvInstallDeps } from './commands/env'

const program = new Command()
program
  .name('tunnelbox')
  .description('Site Holder CLI — manage local static sites with Cloudflare tunnels')
  .version(require('../../package.json').version)
  .option('--json', 'Output in JSON format', false)

const store = new FileStore()
const serverManager = new ServerManager()

function requireElectron(feature: string): never {
  throw CLIError.system(`TunnelBox app is not running. Please open TunnelBox to use \`${feature}\`.`)
}

// Tunnel deps: lazily resolved at first command invocation so Electron
// can start after the CLI process loads.
let _tunnelDeps: TunnelDeps | null = null
function getTunnelDeps(): TunnelDeps {
  if (!_tunnelDeps) {
    _tunnelDeps = isElectronRunning()
      ? createElectronApiClient()
      : {
          findBinary,
          startQuickTunnel: async () => {
            throw new Error('TunnelBox app is not running. Please open TunnelBox first.')
          },
          stopQuickTunnel: () => {},
          hasTunnel: () => false,
          getTunnelInfo: () => undefined,
        }
  }
  return _tunnelDeps
}

let _authDeps: AuthDeps | null = null
function getAuthDeps(): AuthDeps {
  if (!_authDeps) {
    if (!isElectronRunning()) requireElectron('auth')
    _authDeps = createElectronAuthClient()
  }
  return _authDeps
}

let _domainDeps: DomainDeps | null = null
function getDomainDeps(): DomainDeps {
  if (!_domainDeps) {
    if (!isElectronRunning()) requireElectron('domain')
    _domainDeps = createElectronDomainClient()
  }
  return _domainDeps
}

let _envInstallDeps: EnvInstallDeps | null = null
function getEnvInstallDeps(): EnvInstallDeps {
  if (!_envInstallDeps) {
    if (!isElectronRunning()) requireElectron('env install')
    _envInstallDeps = createElectronEnvClient()
  }
  return _envInstallDeps
}

// Register command groups
registerSiteCommands(program, store)
registerServerCommands(program, store, serverManager)
registerEnvCommands(program, detectCloudflared, getEnvInstallDeps)
registerTunnelCommands(program, store, serverManager, getTunnelDeps)
registerAuthCommands(program, getAuthDeps)
registerDomainCommands(program, store, getDomainDeps)

process.on('uncaughtException', (err) => handleError(err, program.opts().json))

program.parse()
