#!/usr/bin/env node
import { Command } from 'commander'
import { handleError } from './errors'
import { FileStore } from '../core/store-file'
import { ServerManager } from '../main/server-manager'
import { registerSiteCommands } from './commands/site'
import { registerServerCommands } from './commands/server'
import { registerEnvCommands } from './commands/env'
import { registerTunnelCommands } from './commands/tunnel'
import { detectCloudflared, findBinary } from './cloudflared-cli'
import { isElectronRunning, createElectronApiClient } from './electron-api-client'
import type { TunnelDeps } from './commands/tunnel' // used by getTunnelDeps

const program = new Command()
program
  .name('tunnelbox')
  .description('Site Holder CLI — manage local static sites with Cloudflare tunnels')
  .version(require('../../package.json').version)
  .option('--json', 'Output in JSON format', false)

const store = new FileStore()
const serverManager = new ServerManager()

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

// Register command groups
registerSiteCommands(program, store)
registerServerCommands(program, store, serverManager)
registerEnvCommands(program, detectCloudflared)
registerTunnelCommands(program, store, serverManager, getTunnelDeps)

process.on('uncaughtException', (err) => handleError(err, program.opts().json))

program.parse()
