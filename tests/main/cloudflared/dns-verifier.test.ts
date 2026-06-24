import { describe, it, expect } from 'vitest'
import { verifyCname, cfargoTarget } from '../../../src/main/cloudflared/dns-verifier'

const TID = 'abcd1234-ef56-7890-abcd-ef1234567890'
const TARGET = cfargoTarget(TID)

describe('cfargoTarget', () => {
  it('builds the cfargotunnel target', () => {
    expect(TARGET).toBe(`${TID}.cfargotunnel.com`)
  })
})

describe('verifyCname', () => {
  it('verifies when the CNAME matches (case/dot-insensitive)', async () => {
    const r = await verifyCname('dev.example.com', TARGET, async () => [`${TID}.CFARGOTUNNEL.COM.`])
    expect(r.verified).toBe(true)
  })

  it('reports mismatch when CNAME points elsewhere', async () => {
    const r = await verifyCname('dev.example.com', TARGET, async () => ['somewhere.else.com'])
    expect(r.verified).toBe(false)
    if (!r.verified) expect(r.reason).toBe('mismatch')
  })

  it('reports not_found on ENOTFOUND', async () => {
    const r = await verifyCname('dev.example.com', TARGET, async () => {
      const e = new Error('not found') as NodeJS.ErrnoException
      e.code = 'ENOTFOUND'
      throw e
    })
    expect(r.verified).toBe(false)
    if (!r.verified) expect(r.reason).toBe('not_found')
  })

  it('reports not_found on ENODATA (no CNAME, maybe an A record)', async () => {
    const r = await verifyCname('dev.example.com', TARGET, async () => {
      const e = new Error('no data') as NodeJS.ErrnoException
      e.code = 'ENODATA'
      throw e
    })
    expect(r.verified).toBe(false)
    if (!r.verified) expect(r.reason).toBe('not_found')
  })

  it('reports lookup_error on other DNS failures', async () => {
    const r = await verifyCname('dev.example.com', TARGET, async () => {
      const e = new Error('SERVFAIL') as NodeJS.ErrnoException
      e.code = 'ESERVFAIL'
      throw e
    })
    expect(r.verified).toBe(false)
    if (!r.verified) expect(r.reason).toBe('lookup_error')
  })
})
