import { app } from 'electron'

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 } as const
type Level = keyof typeof LEVELS

function getLevel(): Level {
  const env = process.env.LOG_LEVEL?.toLowerCase()
  if (env && env in LEVELS) return env as Level
  // Electron: app.isPackaged is false during `electron-vite dev`
  return app.isPackaged ? 'warn' : 'info'
}

let currentLevel = getLevel()

function shouldLog(level: Level): boolean {
  return LEVELS[level] <= LEVELS[currentLevel]
}

function formatArgs(tag: string, args: unknown[]): unknown[] {
  return [`[${tag}]`, ...args]
}

export function setLogLevel(level: Level): void {
  currentLevel = level
}

export function createLogger(tag: string) {
  return {
    error: (...args: unknown[]) => {
      if (shouldLog('error')) console.error(...formatArgs(tag, args))
    },
    warn: (...args: unknown[]) => {
      if (shouldLog('warn')) console.warn(...formatArgs(tag, args))
    },
    info: (...args: unknown[]) => {
      if (shouldLog('info')) console.log(...formatArgs(tag, args))
    },
    debug: (...args: unknown[]) => {
      if (shouldLog('debug')) console.log(...formatArgs(tag, args))
    }
  }
}
