import { describe, it, expect, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { writeApiInfo, readApiInfo, deleteApiInfo, getApiInfoPath } from '@/core/api-discovery'

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tunnelbox-api-test-'))
const testApiPath = path.join(tmpDir, 'api.json')

afterEach(() => {
  try { fs.unlinkSync(testApiPath) } catch { /* noop */ }
})

describe('api-discovery', () => {
  describe('getApiInfoPath', () => {
    it('returns a path ending with api.json', () => {
      expect(getApiInfoPath()).toMatch(/api\.json$/)
    })
  })

  describe('writeApiInfo + readApiInfo', () => {
    it('roundtrips correctly', () => {
      writeApiInfo({ port: 47321, pid: 12345 }, testApiPath)
      const info = readApiInfo(testApiPath)
      expect(info).toEqual({ port: 47321, pid: 12345 })
    })
  })

  describe('readApiInfo', () => {
    it('returns null when file does not exist', () => {
      expect(readApiInfo(testApiPath)).toBeNull()
    })

    it('returns null when file has invalid JSON', () => {
      fs.writeFileSync(testApiPath, 'not json', 'utf-8')
      expect(readApiInfo(testApiPath)).toBeNull()
    })

    it('returns null when file has wrong shape', () => {
      fs.writeFileSync(testApiPath, '{"port":"not a number"}', 'utf-8')
      expect(readApiInfo(testApiPath)).toBeNull()
    })

    it('returns ApiInfo when file is valid', () => {
      fs.writeFileSync(testApiPath, '{"port":47321,"pid":12345}', 'utf-8')
      expect(readApiInfo(testApiPath)).toEqual({ port: 47321, pid: 12345 })
    })
  })

  describe('deleteApiInfo', () => {
    it('deletes the file when it exists', () => {
      writeApiInfo({ port: 47321, pid: 12345 }, testApiPath)
      expect(readApiInfo(testApiPath)).not.toBeNull()
      deleteApiInfo(testApiPath)
      expect(readApiInfo(testApiPath)).toBeNull()
    })

    it('does not throw when file does not exist', () => {
      expect(() => deleteApiInfo(testApiPath)).not.toThrow()
    })
  })
})
