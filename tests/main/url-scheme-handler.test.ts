import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'

// Mock Electron modules before importing the handler
vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    setAsDefaultProtocolClient: vi.fn(),
    on: vi.fn(),
    whenReady: vi.fn().mockResolvedValue(undefined),
  },
  BrowserWindow: {
    getAllWindows: vi.fn().mockReturnValue([]),
  },
  dialog: {
    showMessageBox: vi.fn().mockResolvedValue({ response: 1 }),
  },
}))

// Mock site-actions to prevent store.ts from loading ElectronStore at module level
vi.mock('@/main/site-actions', () => ({
  addSiteFromPath: vi.fn(),
}))

import { validateServePath } from '@/main/url-scheme-handler'

const home = os.homedir()

describe('validateServePath', () => {
  describe('home directory restriction', () => {
    it('allows a path inside the home directory', () => {
      const result = validateServePath(path.join(home, 'projects', 'my-site'))
      expect(result).toBeNull()
    })

    it('allows the home directory itself', () => {
      const result = validateServePath(home)
      expect(result).toBeNull()
    })

    it('rejects a path outside the home directory', () => {
      const result = validateServePath('/etc/passwd')
      expect(result).toContain('outside your home directory')
    })

    it('rejects the root path', () => {
      const result = validateServePath('/')
      expect(result).toContain('outside your home directory')
    })

    it('rejects /tmp path', () => {
      const result = validateServePath('/tmp')
      expect(result).toContain('outside your home directory')
    })

    it('normalises path traversal attempts', () => {
      // e.g. ~/projects/../../etc/passwd resolves outside home
      const result = validateServePath(path.join(home, 'projects', '..', '..', 'etc', 'passwd'))
      expect(result).toContain('outside your home directory')
    })
  })

  describe('sensitive directory restriction', () => {
    const sensitiveDirs = ['.ssh', '.gnupg', '.aws', '.azure', '.config', '.kube', '.docker', '.npmrc', '.env', '.git']

    for (const dir of sensitiveDirs) {
      it(`rejects paths containing ${dir}`, () => {
        const result = validateServePath(path.join(home, dir))
        expect(result).toContain(`sensitive directory "${dir}"`)
      })

      it(`rejects paths with ${dir} as an intermediate segment`, () => {
        const result = validateServePath(path.join(home, dir, 'subdir'))
        expect(result).toContain(`sensitive directory "${dir}"`)
      })
    }

    it('allows a safe directory that has a similar name', () => {
      const result = validateServePath(path.join(home, 'my-ssh-keys'))
      expect(result).toBeNull()
    })

    it('allows a normal project path', () => {
      const result = validateServePath(path.join(home, 'projects', 'my-website', 'public'))
      expect(result).toBeNull()
    })
  })

  describe('path resolution', () => {
    let originalCwd: string

    beforeEach(() => {
      originalCwd = process.cwd()
    })

    afterEach(() => {
      process.chdir(originalCwd)
    })

    it('resolves relative paths against cwd', () => {
      // When cwd is inside home, a relative safe path should be allowed
      process.chdir(home)
      const result = validateServePath('my-site')
      expect(result).toBeNull()
    })
  })

  describe('symlink resolution (TIM-318 / F32)', () => {
    const base = path.join(home, '.tb-f32-test')
    beforeEach(() => fs.rmSync(base, { recursive: true, force: true }))
    afterEach(() => fs.rmSync(base, { recursive: true, force: true }))

    it('rejects a symlink under home that resolves into a sensitive dir', () => {
      fs.mkdirSync(path.join(base, '.ssh'), { recursive: true })
      const link = path.join(base, 'link')
      fs.symlinkSync(path.join(base, '.ssh'), link, 'dir')
      // String-only resolution sees ".../link" (no sensitive segment) and would
      // ALLOW; realpath resolves to ".../.ssh" → rejected.
      expect(validateServePath(link)).toContain('sensitive directory')
    })

    it('still allows a normal real directory under home (realpath both sides)', () => {
      const dir = path.join(base, 'public')
      fs.mkdirSync(dir, { recursive: true })
      expect(validateServePath(dir)).toBeNull()
    })
  })
})
