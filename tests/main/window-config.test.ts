import { describe, it, expect } from 'vitest'
import { SECURE_WEB_PREFERENCES } from '@/main/window-config'

describe('SECURE_WEB_PREFERENCES (main-window isolation regression guard — TIM-318 / F31)', () => {
  it('keeps the four isolation flags at their secure values', () => {
    expect(SECURE_WEB_PREFERENCES.sandbox).toBe(true)
    expect(SECURE_WEB_PREFERENCES.contextIsolation).toBe(true)
    expect(SECURE_WEB_PREFERENCES.nodeIntegration).toBe(false)
    expect(SECURE_WEB_PREFERENCES.webSecurity).toBe(true)
  })
})
