// --- Update State Machine ---

export type UpdateState =
  | { phase: 'idle' }
  | { phase: 'checking' }
  | { phase: 'available'; version: string }
  | { phase: 'not-available' }
  | { phase: 'downloading'; percent: number }
  | { phase: 'ready'; version: string }
  | { phase: 'error'; message: string }

// --- Force Update ---

export interface ForceUpdateConfig {
  minVersion: string
  message?: string
  downloadUrl?: string
}

export interface ForceUpdateCheckResult {
  blocked: boolean
  config: ForceUpdateConfig | null
  currentVersion: string
}
