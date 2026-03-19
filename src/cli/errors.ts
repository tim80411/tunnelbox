export class CLIError extends Error {
  constructor(
    message: string,
    public exitCode: number = 1
  ) {
    super(message)
    this.name = 'CLIError'
  }
  static input(message: string): CLIError {
    return new CLIError(message, 1)
  }
  static system(message: string): CLIError {
    return new CLIError(message, 2)
  }
}

export function handleError(err: unknown, json: boolean): never {
  if (err instanceof CLIError) {
    if (json) console.log(JSON.stringify({ success: false, error: err.message }))
    else console.error(`Error: ${err.message}`)
    process.exit(err.exitCode)
  }
  const message = err instanceof Error ? err.message : String(err)
  if (json) console.log(JSON.stringify({ success: false, error: `Unexpected error: ${message}` }))
  else console.error(`Unexpected error: ${message}`)
  process.exit(2)
}
