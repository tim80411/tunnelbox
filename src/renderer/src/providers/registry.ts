import type { ProviderEnv } from '../../../shared/provider-types'
import type { FrpServerConfig, BoreServerConfig } from '../../../shared/types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ProviderType = 'cloudflare' | 'frp' | 'bore'

export interface ConfigField {
  key: string
  label: string
  type: 'text' | 'number' | 'password'
  placeholder?: string
  required?: boolean
  defaultValue?: string | number
  validate?: (value: string) => string | null
}

export interface ProviderDefinition<TConfig = unknown> {
  type: ProviderType
  label: string
  description: string
  installHint: string
  badgeClass: string // 'cf' | 'frp' | 'bore'
  priority: number   // install bar display priority, lower = higher priority
  ipc: {
    getStatus: () => Promise<ProviderEnv>
    install: () => Promise<void>
    onStatusChanged: (cb: (env: ProviderEnv) => void) => () => void
    getConfig?: () => Promise<TConfig | null>
    saveConfig?: (config: TConfig) => Promise<TConfig>
    startTunnel?: (siteId: string, opts?: Record<string, unknown>) => Promise<string>
  }
  configFields?: ConfigField[]
  hasAuth?: boolean
}

// ---------------------------------------------------------------------------
// Shared validators
// ---------------------------------------------------------------------------

export const portValidator = (v: string): string | null => {
  const n = Number(v)
  return Number.isInteger(n) && n >= 1 && n <= 65535 ? null : '連接埠必須在 1-65535 之間'
}

// ---------------------------------------------------------------------------
// Provider definitions
// ---------------------------------------------------------------------------

const cloudflareProvider: ProviderDefinition<undefined> = {
  type: 'cloudflare',
  label: 'Cloudflare Tunnel',
  description: '免費、零設定、隨機或固定網域',
  installHint: '需先安裝 cloudflared',
  badgeClass: 'cf',
  priority: 0,
  hasAuth: true,
  ipc: {
    getStatus: () => window.electron.getCloudflaredStatus(),
    install: () => window.electron.installCloudflared(),
    onStatusChanged: (cb) => window.electron.onCloudflaredStatusChanged(cb)
  }
}

const frpProvider: ProviderDefinition<FrpServerConfig> = {
  type: 'frp',
  label: 'frp（自架伺服器）',
  description: '需自備 VPS，TCP 轉發，功能完整',
  installHint: '需先安裝 frpc',
  badgeClass: 'frp',
  priority: 1,
  ipc: {
    getStatus: () => window.electron.getFrpStatus(),
    install: () => window.electron.installFrp(),
    onStatusChanged: (cb) => window.electron.onFrpStatusChanged(cb),
    getConfig: () => window.electron.getFrpConfig(),
    saveConfig: (config) => window.electron.setFrpConfig(config),
    startTunnel: (siteId, opts) => window.electron.startFrpTunnel(siteId, opts)
  },
  configFields: [
    {
      key: 'serverAddr',
      label: '伺服器位址',
      type: 'text',
      placeholder: 'example.com',
      required: true
    },
    {
      key: 'serverPort',
      label: '伺服器連接埠',
      type: 'number',
      placeholder: '7000',
      required: true,
      defaultValue: 7000,
      validate: portValidator
    },
    {
      key: 'authToken',
      label: '驗證金鑰',
      type: 'password',
      placeholder: '（選填）',
      required: false
    }
  ]
}

const boreProvider: ProviderDefinition<BoreServerConfig> = {
  type: 'bore',
  label: 'bore（自架伺服器）',
  description: '需自備 VPS，極簡輕量',
  installHint: '需先安裝 bore',
  badgeClass: 'bore',
  priority: 2,
  ipc: {
    getStatus: () => window.electron.getBoreStatus(),
    install: () => window.electron.installBore(),
    onStatusChanged: (cb) => window.electron.onBoreStatusChanged(cb),
    getConfig: () => window.electron.getBoreConfig(),
    saveConfig: (config) => window.electron.setBoreConfig(config),
    startTunnel: (siteId, opts) => window.electron.startBoreTunnel(siteId, opts)
  },
  configFields: [
    {
      key: 'serverAddr',
      label: '伺服器位址',
      type: 'text',
      placeholder: 'example.com',
      required: true
    },
    {
      key: 'serverPort',
      label: '伺服器連接埠',
      type: 'number',
      placeholder: '7835',
      required: true,
      defaultValue: 7835,
      validate: portValidator
    },
    {
      key: 'secret',
      label: '密鑰',
      type: 'password',
      placeholder: '（選填）',
      required: false
    }
  ]
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const providers: Record<ProviderType, ProviderDefinition<any>> = {
  cloudflare: cloudflareProvider,
  frp: frpProvider,
  bore: boreProvider
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const providerList: ProviderDefinition<any>[] = [cloudflareProvider, frpProvider, boreProvider]
