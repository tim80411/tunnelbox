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
import type { TunnelDeps } from './commands/tunnel'

const program = new Command()
program
  .name('tunnelbox')
  .description('Site Holder CLI — manage local static sites with Cloudflare tunnels')
  .version(require('../../package.json').version)
  .option('--json', 'Output in JSON format', false)

const store = new FileStore()
const serverManager = new ServerManager()

// Tunnel deps use CLI-specific cloudflared (no Electron dependency).
// Quick tunnel start/stop are not yet supported in CLI mode —
// they require ProcessManager which depends on Electron modules.
const tunnelDeps: TunnelDeps = {
  findBinary,
  startQuickTunnel: async () => {
    throw new Error('Quick tunnel is not yet supported in CLI mode')
  },
  stopQuickTunnel: () => {
    // no-op in CLI mode
  },
  hasTunnel: () => false,
  getTunnelInfo: () => undefined,
}

// Register command groups
registerSiteCommands(program, store)
registerServerCommands(program, store, serverManager)
registerEnvCommands(program, detectCloudflared)
registerTunnelCommands(program, store, serverManager, tunnelDeps)

process.on('uncaughtException', (err) => handleError(err, program.opts().json))

program.parse()
