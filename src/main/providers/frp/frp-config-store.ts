import Store from 'electron-store'
import { safeStorage } from 'electron'
import { createLogger } from '../../logger'
import type { FrpServerConfig } from '../../../shared/types'

export type { FrpServerConfig }

const log = createLogger('FrpConfigStore')

interface FrpStoreSchema {
  frpConfig: {
    serverAddr: string
    serverPort: number
    encryptedAuthToken?: string
  } | null
}

const store = new Store<FrpStoreSchema>({
  name: 'tunnelbox-frp',
  defaults: {
    frpConfig: null,
  },
})

export function getFrpConfig(): FrpServerConfig | null {
  try {
    const raw = store.get('frpConfig')
    if (!raw) return null

    let authToken: string | undefined
    if (raw.encryptedAuthToken) {
      if (!safeStorage.isEncryptionAvailable()) {
        log.warn('safeStorage encryption not available — cannot decrypt stored auth token')
      } else {
        try {
          const buffer = Buffer.from(raw.encryptedAuthToken, 'base64')
          authToken = safeStorage.decryptString(buffer)
        } catch (err) {
          log.warn('Failed to decrypt frp auth token:', err)
        }
      }
    }

    return {
      serverAddr: raw.serverAddr,
      serverPort: raw.serverPort,
      authToken,
    }
  } catch (err) {
    log.error('Failed to read frp config:', err)
    return null
  }
}

export function saveFrpConfig(config: FrpServerConfig): void {
  try {
    let encryptedAuthToken: string | undefined
    if (config.authToken) {
      if (!safeStorage.isEncryptionAvailable()) {
        throw new Error(
          'OS 加密功能無法使用，無法安全儲存 auth token。請確認系統鑰匙圈 (Keychain) 已解鎖。',
        )
      }
      const buffer = safeStorage.encryptString(config.authToken)
      encryptedAuthToken = buffer.toString('base64')
    }

    store.set('frpConfig', {
      serverAddr: config.serverAddr,
      serverPort: config.serverPort,
      encryptedAuthToken,
    })
  } catch (err) {
    log.error('Failed to save frp config:', err)
    throw err
  }
}

export function clearFrpConfig(): void {
  try {
    store.set('frpConfig', null)
  } catch (err) {
    log.error('Failed to clear frp config:', err)
  }
}
