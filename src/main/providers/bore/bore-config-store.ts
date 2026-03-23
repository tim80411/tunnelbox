import Store from 'electron-store'
import { safeStorage } from 'electron'
import { createLogger } from '../../logger'
import type { BoreServerConfig } from '../../../shared/types'

export type { BoreServerConfig }

const log = createLogger('BoreConfigStore')

interface BoreStoreSchema {
  boreConfig: {
    serverAddr: string
    serverPort: number
    encryptedSecret?: string
  } | null
}

const store = new Store<BoreStoreSchema>({
  name: 'tunnelbox-bore',
  defaults: {
    boreConfig: null,
  },
})

export function getBoreConfig(): BoreServerConfig | null {
  try {
    const raw = store.get('boreConfig')
    if (!raw) return null

    let secret: string | undefined
    if (raw.encryptedSecret) {
      try {
        if (safeStorage.isEncryptionAvailable()) {
          const buffer = Buffer.from(raw.encryptedSecret, 'base64')
          secret = safeStorage.decryptString(buffer)
        }
      } catch (err) {
        log.warn('Failed to decrypt bore secret:', err)
      }
    }

    return {
      serverAddr: raw.serverAddr,
      serverPort: raw.serverPort,
      secret,
    }
  } catch (err) {
    log.error('Failed to read bore config:', err)
    return null
  }
}

export function saveBoreConfig(config: BoreServerConfig): void {
  try {
    let encryptedSecret: string | undefined
    if (config.secret) {
      if (safeStorage.isEncryptionAvailable()) {
        const buffer = safeStorage.encryptString(config.secret)
        encryptedSecret = buffer.toString('base64')
      } else {
        log.warn('safeStorage encryption not available, storing secret in plaintext')
        encryptedSecret = Buffer.from(config.secret).toString('base64')
      }
    }

    store.set('boreConfig', {
      serverAddr: config.serverAddr,
      serverPort: config.serverPort,
      encryptedSecret,
    })
  } catch (err) {
    log.error('Failed to save bore config:', err)
  }
}

export function clearBoreConfig(): void {
  try {
    store.set('boreConfig', null)
  } catch (err) {
    log.error('Failed to clear bore config:', err)
  }
}
