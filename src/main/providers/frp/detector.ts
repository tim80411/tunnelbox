import path from 'node:path'
import { app } from 'electron'
import { findBinary as sharedFindBinary, detectBinary } from '../shared/binary-detector'
import type { BinaryDetectorConfig } from '../shared/binary-detector'

const MIN_VERSION = '0.51.0'

function getLocalBinaryPath(): string {
  const ext = process.platform === 'win32' ? '.exe' : ''
  return path.join(app.getPath('userData'), 'bin', `frpc${ext}`)
}

const frpDetectorConfig: BinaryDetectorConfig = {
  name: 'frpc',
  minVersion: MIN_VERSION,
  localBinaryPath: getLocalBinaryPath(),
  wellKnownPaths: ['/opt/homebrew/bin/frpc', '/usr/local/bin/frpc'],
  versionArgs: ['--version'],
  versionRegex: /(\d+\.\d+\.\d+)/
}

async function detectFrpc() {
  return detectBinary({ ...frpDetectorConfig, localBinaryPath: getLocalBinaryPath() })
}

async function findBinary() {
  return sharedFindBinary({ ...frpDetectorConfig, localBinaryPath: getLocalBinaryPath() })
}

export { detectFrpc, getLocalBinaryPath, findBinary, MIN_VERSION }
