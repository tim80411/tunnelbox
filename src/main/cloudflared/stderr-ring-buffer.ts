/**
 * Fixed-capacity ring buffer of recent stderr lines for the tunnel watchdog
 * (TIM-222). Keeps the last ~N non-blank lines so they can be surfaced in the
 * translated error / diagnostics when a tunnel fails or gets stuck.
 */
export class StderrRingBuffer {
  private readonly capacity: number
  private buffer: string[] = []

  constructor(capacity = 50) {
    this.capacity = Math.max(1, capacity)
  }

  /**
   * Append a raw stderr chunk. The chunk may contain multiple lines and/or a
   * trailing newline; it is split into individual non-blank lines, each pushed
   * separately so the buffer always holds whole lines.
   */
  push(chunk: string): void {
    if (typeof chunk !== 'string' || chunk.length === 0) return
    const lines = chunk.split(/\r?\n/)
    for (const line of lines) {
      const trimmed = line.trim()
      if (trimmed.length === 0) continue
      this.buffer.push(trimmed)
      if (this.buffer.length > this.capacity) {
        this.buffer.shift()
      }
    }
  }

  /** Current buffered lines, oldest first. */
  lines(): string[] {
    return [...this.buffer]
  }

  /** Buffered lines joined by newlines, for embedding in an error/log. */
  snapshot(): string {
    return this.buffer.join('\n')
  }

  /** Drop all buffered lines. */
  clear(): void {
    this.buffer = []
  }
}
