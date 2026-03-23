import { useEffect, useState, useCallback } from 'react'
import type { ProviderEnv } from '../../../shared/provider-types'
import type { ProviderDefinition } from '../providers/registry'

export function useProvider<TConfig>(def: ProviderDefinition<TConfig>) {
  const [env, setEnv] = useState<ProviderEnv>({ status: 'checking' })
  const [config, setConfig] = useState<TConfig | null>(null)

  useEffect(() => {
    Promise.all([
      def.ipc.getStatus().catch(() => ({ status: 'error', errorMessage: `無法取得 ${def.label} 狀態` }) as ProviderEnv),
      def.ipc.getConfig?.().catch(() => null) ?? Promise.resolve(null)
    ]).then(([envResult, cfgResult]) => {
      setEnv(envResult)
      setConfig(cfgResult as TConfig | null)
    })

    const unsub = def.ipc.onStatusChanged(setEnv)
    return unsub
  }, [def])

  const install = useCallback(async () => {
    setEnv({ status: 'installing' })
    try {
      await def.ipc.install()
      const newEnv = await def.ipc.getStatus()
      setEnv(newEnv)
    } catch (err) {
      setEnv({
        status: 'install_failed',
        errorMessage: err instanceof Error ? err.message : `安裝 ${def.label} 失敗`
      })
    }
  }, [def])

  const saveConfig = useCallback(async (cfg: TConfig): Promise<TConfig> => {
    if (!def.ipc.saveConfig) throw new Error('This provider does not support config')
    const saved = await def.ipc.saveConfig(cfg)
    setConfig(saved)
    return saved
  }, [def])

  return { env, config, install, saveConfig }
}
