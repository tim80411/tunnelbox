import { join } from 'node:path'
import { homedir } from 'node:os'

/**
 * Platform-aware app-data directory for TunnelBox.
 * - macOS: ~/Library/Application Support/tunnelbox
 * - Windows: %APPDATA%/tunnelbox
 * - Linux: ~/.config/tunnelbox
 */
export function getAppDataDir(): string {
  const platform = process.platform
  if (platform === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', 'tunnelbox')
  } else if (platform === 'win32') {
    return join(
      process.env.APPDATA || join(homedir(), 'AppData', 'Roaming'),
      'tunnelbox',
    )
  }
  return join(homedir(), '.config', 'tunnelbox')
}
