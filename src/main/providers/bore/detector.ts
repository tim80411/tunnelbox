import path from 'node:path'
import os from 'node:os'
import { app } from 'electron'
import { findBinary as sharedFindBinary, detectBinary } from '../shared/binary-detector'
import type { BinaryDetectorConfig } from '../shared/binary-detector'

const MIN_VERSION = '0.5.0'

function getLocalBinaryPath(): string {
  const ext = process.platform === 'win32' ? '.exe' : ''
  return path.join(app.getPath('userData'), 'bin', `bore${ext}`)
}

function getBoreDetectorConfig(): BinaryDetectorConfig {
  return {
    name: 'bore',
    minVersion: MIN_VERSION,
    localBinaryPath: getLocalBinaryPath(),
    wellKnownPaths: [
      '/opt/homebrew/bin/bore',
      '/usr/local/bin/bore',
      path.join(os.homedir(), '.cargo/bin/bore'),
    ],
    versionArgs: ['--version'],
    versionRegex: /(\d+\.\d+\.\d+)/
  }
}

async function detectBore() {
  return detectBinary(getBoreDetectorConfig())
}

async function findBinary() {
  return sharedFindBinary(getBoreDetectorConfig())
}

export { detectBore, getLocalBinaryPath, findBinary, MIN_VERSION }
