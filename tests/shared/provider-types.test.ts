import { describe, it, expectTypeOf } from 'vitest'
import type {
  ProviderEnv,
  ProviderAuthInfo,
  ProviderTunnelInfo,
  TunnelProvider
} from '../../src/shared/provider-types'

describe('Provider types', () => {
  it('ProviderEnv has required fields', () => {
    expectTypeOf<ProviderEnv>().toHaveProperty('status')
    expectTypeOf<ProviderEnv['status']>().toEqualTypeOf<
      'checking' | 'available' | 'not_installed' | 'outdated' | 'installing' | 'install_failed' | 'error'
    >()
  })

  it('ProviderAuthInfo includes not_required status', () => {
    const auth: ProviderAuthInfo = { status: 'not_required' }
    expectTypeOf(auth.status).toMatchTypeOf<string>()
  })

  it('ProviderTunnelInfo has providerType', () => {
    expectTypeOf<ProviderTunnelInfo>().toHaveProperty('providerType')
  })

  it('TunnelProvider has required methods', () => {
    expectTypeOf<TunnelProvider>().toHaveProperty('detect')
    expectTypeOf<TunnelProvider>().toHaveProperty('startTunnel')
    expectTypeOf<TunnelProvider>().toHaveProperty('stopTunnel')
    expectTypeOf<TunnelProvider>().toHaveProperty('stopAll')
    expectTypeOf<TunnelProvider>().toHaveProperty('restoreAll')
  })

  it('TunnelProvider.bindDomain is optional', () => {
    expectTypeOf<TunnelProvider['bindDomain']>().toBeNullable()
  })
})
