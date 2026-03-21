import { useEffect, useState, useCallback } from 'react'
import type { CloudflaredEnv, FrpServerConfig } from '../../../shared/types'

export function useFrpProvider() {
  const [frpcEnv, setFrpcEnv] = useState<CloudflaredEnv>({ status: 'checking' })
  const [frpConfig, setFrpConfig] = useState<FrpServerConfig | null>(null)

  useEffect(() => {
    Promise.all([
      window.electron.getFrpStatus().catch(() => ({ status: 'error', errorMessage: '無法取得 frpc 狀態' }) as CloudflaredEnv),
      window.electron.getFrpConfig().catch(() => null)
    ]).then(([env, cfg]) => {
      setFrpcEnv(env)
      setFrpConfig(cfg)
    })

    const unsub = window.electron.onFrpStatusChanged(setFrpcEnv)
    return unsub
  }, [])

  const installFrpc = useCallback(async () => {
    setFrpcEnv({ status: 'installing' })
    try {
      await window.electron.installFrp()
      const env = await window.electron.getFrpStatus()
      setFrpcEnv(env)
    } catch (err) {
      setFrpcEnv({
        status: 'install_failed',
        errorMessage: err instanceof Error ? err.message : '安裝 frpc 失敗'
      })
    }
  }, [])

  const saveConfig = useCallback(async (config: FrpServerConfig) => {
    const saved = await window.electron.setFrpConfig(config)
    setFrpConfig(saved)
    return saved
  }, [])

  return { frpcEnv, frpConfig, installFrpc, saveConfig }
}
