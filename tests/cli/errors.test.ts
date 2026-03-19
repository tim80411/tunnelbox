import { describe, it, expect, vi } from 'vitest'
import { CLIError, handleError } from '@/cli/errors'

describe('CLIError', () => {
  it('creates with default exit code 1', () => {
    const err = new CLIError('test error')
    expect(err.message).toBe('test error')
    expect(err.exitCode).toBe(1)
    expect(err.name).toBe('CLIError')
  })

  it('creates with custom exit code', () => {
    const err = new CLIError('test error', 2)
    expect(err.exitCode).toBe(2)
  })

  it('CLIError.input creates exit code 1', () => {
    const err = CLIError.input('bad input')
    expect(err.exitCode).toBe(1)
    expect(err.message).toBe('bad input')
  })

  it('CLIError.system creates exit code 2', () => {
    const err = CLIError.system('system failure')
    expect(err.exitCode).toBe(2)
    expect(err.message).toBe('system failure')
  })

  it('is instanceof Error', () => {
    const err = new CLIError('test')
    expect(err).toBeInstanceOf(Error)
    expect(err).toBeInstanceOf(CLIError)
  })
})

describe('handleError', () => {
  it('outputs JSON for CLIError when json=true', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)

    handleError(new CLIError('bad', 1), true)

    expect(logSpy).toHaveBeenCalledWith(JSON.stringify({ success: false, error: 'bad' }))
    expect(exitSpy).toHaveBeenCalledWith(1)

    logSpy.mockRestore()
    exitSpy.mockRestore()
  })

  it('outputs stderr for CLIError when json=false', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)

    handleError(new CLIError('bad', 1), false)

    expect(errorSpy).toHaveBeenCalledWith('Error: bad')
    expect(exitSpy).toHaveBeenCalledWith(1)

    errorSpy.mockRestore()
    exitSpy.mockRestore()
  })

  it('handles unknown errors with exit code 2', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)

    handleError(new Error('oops'), false)

    expect(errorSpy).toHaveBeenCalledWith('Unexpected error: oops')
    expect(exitSpy).toHaveBeenCalledWith(2)

    errorSpy.mockRestore()
    exitSpy.mockRestore()
  })

  it('handles non-Error values', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)

    handleError('string error', false)

    expect(errorSpy).toHaveBeenCalledWith('Unexpected error: string error')
    expect(exitSpy).toHaveBeenCalledWith(2)

    errorSpy.mockRestore()
    exitSpy.mockRestore()
  })

  it('handles unknown errors in JSON mode', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)

    handleError(new Error('boom'), true)

    expect(logSpy).toHaveBeenCalledWith(
      JSON.stringify({ success: false, error: 'Unexpected error: boom' }),
    )
    expect(exitSpy).toHaveBeenCalledWith(2)

    logSpy.mockRestore()
    exitSpy.mockRestore()
  })
})
