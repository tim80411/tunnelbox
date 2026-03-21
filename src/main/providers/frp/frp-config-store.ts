import Store from 'electron-store'
import { safeStorage } from 'electron'
import { createLogger } from '../../logger'

const log = createLogger('FrpConfigStore')

export interface FrpServerConfig {
  serverAddr: string
  serverPort: number
  authToken?: string
}

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
      try {
        if (safeStorage.isEncryptionAvailable()) {
          const buffer = Buffer.from(raw.encryptedAuthToken, 'base64')
          authToken = safeStorage.decryptString(buffer)
        }
      } catch (err) {
        log.warn('Failed to decrypt frp auth token:', err)
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
      if (safeStorage.isEncryptionAvailable()) {
        const buffer = safeStorage.encryptString(config.authToken)
        encryptedAuthToken = buffer.toString('base64')
      } else {
        log.warn('safeStorage encryption not available, storing token in plaintext')
        encryptedAuthToken = Buffer.from(config.authToken).toString('base64')
      }
    }

    store.set('frpConfig', {
      serverAddr: config.serverAddr,
      serverPort: config.serverPort,
      encryptedAuthToken,
    })
  } catch (err) {
    log.error('Failed to save frp config:', err)
  }
}

export function clearFrpConfig(): void {
  try {
    store.set('frpConfig', null)
  } catch (err) {
    log.error('Failed to clear frp config:', err)
  }
}
