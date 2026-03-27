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
      if (!safeStorage.isEncryptionAvailable()) {
        log.warn('safeStorage encryption not available — cannot decrypt stored secret')
      } else {
        try {
          const buffer = Buffer.from(raw.encryptedSecret, 'base64')
          secret = safeStorage.decryptString(buffer)
        } catch (err) {
          log.warn('Failed to decrypt bore secret:', err)
        }
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
      if (!safeStorage.isEncryptionAvailable()) {
        throw new Error(
          'OS 加密功能無法使用，無法安全儲存 secret。請確認系統鑰匙圈 (Keychain) 已解鎖。',
        )
      }
      const buffer = safeStorage.encryptString(config.secret)
      encryptedSecret = buffer.toString('base64')
    }

    store.set('boreConfig', {
      serverAddr: config.serverAddr,
      serverPort: config.serverPort,
      encryptedSecret,
    })
  } catch (err) {
    log.error('Failed to save bore config:', err)
    throw err
  }
}

export function clearBoreConfig(): void {
  try {
    store.set('boreConfig', null)
  } catch (err) {
    log.error('Failed to clear bore config:', err)
  }
}
