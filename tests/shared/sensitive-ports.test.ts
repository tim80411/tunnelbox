import { describe, it, expect } from 'vitest'
import { sensitivePortName, isSensitivePort } from '../../src/shared/sensitive-ports'

describe('sensitive-ports', () => {
  it('flags well-known DB/SSH ports with a service name', () => {
    expect(sensitivePortName(22)).toBe('SSH')
    expect(sensitivePortName(5432)).toBe('PostgreSQL')
    expect(sensitivePortName(3306)).toBe('MySQL / MariaDB')
    expect(sensitivePortName(6379)).toBe('Redis')
    expect(sensitivePortName(27017)).toBe('MongoDB')
  })

  it('does not flag ordinary HTTP dev ports', () => {
    expect(sensitivePortName(3000)).toBeNull()
    expect(sensitivePortName(8080)).toBeNull()
    expect(isSensitivePort(5173)).toBe(false)
  })

  it('handles undefined / non-finite input safely', () => {
    expect(sensitivePortName(undefined)).toBeNull()
    expect(sensitivePortName(null)).toBeNull()
    expect(sensitivePortName(NaN)).toBeNull()
    expect(isSensitivePort(undefined)).toBe(false)
  })
})
