import { describe, it, expect, vi } from 'vitest'
import { envCheck } from '@/cli/commands/env'
import type { CloudflaredEnv } from '@/shared/types'

describe('envCheck', () => {
  it('returns installed info when cloudflared is available', async () => {
    const mockDetect = vi.fn(async (): Promise<CloudflaredEnv> => ({
      status: 'available',
      version: '2024.6.1',
    }))

    const result = await envCheck(mockDetect)

    expect(result).toEqual({
      installed: true,
      status: 'available',
      version: '2024.6.1',
    })
  })

  it('returns not-installed info when cloudflared is missing', async () => {
    const mockDetect = vi.fn(async (): Promise<CloudflaredEnv> => ({
      status: 'not_installed',
    }))

    const result = await envCheck(mockDetect)

    expect(result).toEqual({
      installed: false,
      status: 'not_installed',
    })
  })

  it('returns outdated info with version', async () => {
    const mockDetect = vi.fn(async (): Promise<CloudflaredEnv> => ({
      status: 'outdated',
      version: '2023.1.0',
      errorMessage: 'cloudflared version too old',
    }))

    const result = await envCheck(mockDetect)

    expect(result).toEqual({
      installed: true,
      status: 'outdated',
      version: '2023.1.0',
      errorMessage: 'cloudflared version too old',
    })
  })

  it('returns error info when detection fails', async () => {
    const mockDetect = vi.fn(async (): Promise<CloudflaredEnv> => ({
      status: 'error',
      errorMessage: 'Detection failed',
    }))

    const result = await envCheck(mockDetect)

    expect(result).toEqual({
      installed: false,
      status: 'error',
      errorMessage: 'Detection failed',
    })
  })
})
