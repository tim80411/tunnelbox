import { spawn, type ChildProcess } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { createLogger } from '../logger'

const log = createLogger('ProcessManager')

export interface ManagedProcess {
  id: string
  process: ChildProcess
  command: string
  args: string[]
}

export interface ProcessEvents {
  stdout: (id: string, data: string) => void
  stderr: (id: string, data: string) => void
  exit: (id: string, code: number | null, signal: string | null) => void
}

/**
 * Manages cloudflared child processes.
 * Tracks all spawned processes and provides graceful cleanup.
 */
export class ProcessManager extends EventEmitter {
  private processes: Map<string, ManagedProcess> = new Map()

  /**
   * Spawn a new cloudflared child process.
   */
  spawn(id: string, command: string, args: string[]): ChildProcess {
    // Kill existing process with same id
    if (this.processes.has(id)) {
      this.kill(id)
    }

    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe']
    })

    const managed: ManagedProcess = { id, process: child, command, args }
    this.processes.set(id, managed)

    child.stdout?.on('data', (data: Buffer) => {
      this.emit('stdout', id, data.toString())
    })

    child.stderr?.on('data', (data: Buffer) => {
      this.emit('stderr', id, data.toString())
    })

    child.on('exit', (code, signal) => {
      // Only act if this is still the current process for this id.
      // A superseded process (killed by a newer spawn) is silently ignored.
      const current = this.processes.get(id)
      if (current && current.process === child) {
        this.processes.delete(id)
        this.emit('exit', id, code, signal)
      }
    })

    child.on('error', (err) => {
      log.error(`Process ${id} error:`, err.message)
      const current = this.processes.get(id)
      if (current && current.process === child) {
        this.processes.delete(id)
        this.emit('exit', id, 1, null)
      }
    })

    log.info(`Spawned process ${id}: ${command} ${args.join(' ')} (PID: ${child.pid})`)
    return child
  }

  /**
   * Kill a specific process by id. SIGTERM first, SIGKILL after timeout.
   */
  kill(id: string): void {
    const managed = this.processes.get(id)
    if (!managed) return

    const { process: child } = managed
    if (child.exitCode !== null || child.killed) {
      this.processes.delete(id)
      return
    }

    log.info(`Killing process ${id} (PID: ${child.pid})`)

    child.kill('SIGTERM')

    // Force kill after 5 seconds if still alive
    const forceKillTimer = setTimeout(() => {
      if (!child.killed && child.exitCode === null) {
        log.info(`Force killing process ${id}`)
        child.kill('SIGKILL')
      }
    }, 5000)

    child.once('exit', () => {
      clearTimeout(forceKillTimer)
    })
  }

  /**
   * Kill all managed processes. Used on app quit.
   */
  async killAll(): Promise<void> {
    const ids = Array.from(this.processes.keys())
    if (ids.length === 0) return

    log.info(`Killing all ${ids.length} processes`)

    const exitPromises = ids.map((id) => {
      return new Promise<void>((resolve) => {
        const managed = this.processes.get(id)
        if (!managed) {
          resolve()
          return
        }

        const { process: child } = managed

        if (child.exitCode !== null || child.killed) {
          this.processes.delete(id)
          resolve()
          return
        }

        const timeout = setTimeout(() => {
          if (!child.killed && child.exitCode === null) {
            child.kill('SIGKILL')
          }
          resolve()
        }, 5000)

        child.once('exit', () => {
          clearTimeout(timeout)
          resolve()
        })

        child.kill('SIGTERM')
      })
    })

    await Promise.allSettled(exitPromises)
    this.processes.clear()
    log.info('All processes cleaned up')
  }

  /**
   * Check if a process is running by id.
   */
  isRunning(id: string): boolean {
    const managed = this.processes.get(id)
    if (!managed) return false
    return managed.process.exitCode === null && !managed.process.killed
  }

  /**
   * Get count of active processes.
   */
  get activeCount(): number {
    return this.processes.size
  }
}
