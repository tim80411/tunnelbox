import { useEffect, useState, useCallback } from 'react'
import type { CloudflaredEnv, BoreServerConfig } from '../../../shared/types'

export function useBoreProvider() {
  const [boreEnv, setBoreEnv] = useState<CloudflaredEnv>({ status: 'checking' })
  const [boreConfig, setBoreConfig] = useState<BoreServerConfig | null>(null)

  useEffect(() => {
    Promise.all([
      window.electron.getBoreStatus().catch(() => ({ status: 'error', errorMessage: '無法取得 bore 狀態' }) as CloudflaredEnv),
      window.electron.getBoreConfig().catch(() => null)
    ]).then(([env, cfg]) => {
      setBoreEnv(env)
      setBoreConfig(cfg)
    })

    const unsub = window.electron.onBoreStatusChanged(setBoreEnv)
    return unsub
  }, [])

  const installBore = useCallback(async () => {
    setBoreEnv({ status: 'installing' })
    try {
      await window.electron.installBore()
      const env = await window.electron.getBoreStatus()
      setBoreEnv(env)
    } catch (err) {
      setBoreEnv({
        status: 'install_failed',
        errorMessage: err instanceof Error ? err.message : '安裝 bore 失敗'
      })
    }
  }, [])

  const saveConfig = useCallback(async (config: BoreServerConfig) => {
    const saved = await window.electron.setBoreConfig(config)
    setBoreConfig(saved)
    return saved
  }, [])

  return { boreEnv, boreConfig, installBore, saveConfig }
}
