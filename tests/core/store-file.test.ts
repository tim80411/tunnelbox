import { describe, it, expect } from 'vitest'
import { FileStore } from '@/core/store-file'
import { join } from 'path'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import type { StoredSite, StoredAuth, StoredTunnel } from '@/shared/types'

function createTempStore() {
  const tempDir = mkdtempSync(join(tmpdir(), 'filestore-test-'))
  const storePath = join(tempDir, 'tunnelbox-data.json')
  const store = new FileStore(storePath)
  const cleanup = () => rmSync(tempDir, { recursive: true, force: true })
  return { store, storePath, cleanup }
}

describe('FileStore', () => {
  describe('empty store defaults', () => {
    it('returns empty array for sites', () => {
      const { store, cleanup } = createTempStore()
      expect(store.getSites()).toEqual([])
      cleanup()
    })

    it('returns null for auth', () => {
      const { store, cleanup } = createTempStore()
      expect(store.getAuth()).toBeNull()
      cleanup()
    })

    it('returns empty array for tunnels', () => {
      const { store, cleanup } = createTempStore()
      expect(store.getTunnels()).toEqual([])
      cleanup()
    })

    it('returns null for domain binding', () => {
      const { store, cleanup } = createTempStore()
      expect(store.getDomainBinding('nonexistent')).toBeNull()
      cleanup()
    })
  })

  describe('sites CRUD', () => {
    const site1: StoredSite = { id: 'site-1', name: 'my-site', serveMode: 'static', folderPath: '/tmp/site1' }
    const site2: StoredSite = { id: 'site-2', name: 'other-site', serveMode: 'static', folderPath: '/tmp/site2' }

    it('adds and retrieves a site', () => {
      const { store, cleanup } = createTempStore()
      store.addSite(site1)
      expect(store.getSites()).toEqual([site1])
      cleanup()
    })

    it('adds multiple sites', () => {
      const { store, cleanup } = createTempStore()
      store.addSite(site1)
      store.addSite(site2)
      expect(store.getSites()).toEqual([site1, site2])
      cleanup()
    })

    it('removes a site by id', () => {
      const { store, cleanup } = createTempStore()
      store.addSite(site1)
      store.addSite(site2)
      store.removeSite('site-1')
      expect(store.getSites()).toEqual([site2])
      cleanup()
    })

    it('saveSites replaces all sites', () => {
      const { store, cleanup } = createTempStore()
      store.addSite(site1)
      store.saveSites([site2])
      expect(store.getSites()).toEqual([site2])
      cleanup()
    })
  })

  describe('auth', () => {
    const auth: StoredAuth = { certPath: '/path/cert.pem', accountEmail: 'test@example.com' }

    it('saves and retrieves auth', () => {
      const { store, cleanup } = createTempStore()
      store.saveAuth(auth)
      expect(store.getAuth()).toEqual(auth)
      cleanup()
    })

    it('clears auth', () => {
      const { store, cleanup } = createTempStore()
      store.saveAuth(auth)
      store.clearAuth()
      expect(store.getAuth()).toBeNull()
      cleanup()
    })
  })

  describe('tunnels', () => {
    const tunnel1: StoredTunnel = { siteId: 'site-1', tunnelId: 'tun-1', tunnelName: 'my-tunnel' }
    const tunnel2: StoredTunnel = { siteId: 'site-2', tunnelId: 'tun-2', tunnelName: 'other-tunnel' }

    it('saves and retrieves tunnels', () => {
      const { store, cleanup } = createTempStore()
      store.saveTunnel(tunnel1)
      expect(store.getTunnels()).toEqual([tunnel1])
      cleanup()
    })

    it('replaces tunnel for same siteId', () => {
      const { store, cleanup } = createTempStore()
      store.saveTunnel(tunnel1)
      const updated: StoredTunnel = { siteId: 'site-1', tunnelId: 'tun-1-v2', tunnelName: 'updated' }
      store.saveTunnel(updated)
      expect(store.getTunnels()).toEqual([updated])
      cleanup()
    })

    it('removes tunnel by siteId', () => {
      const { store, cleanup } = createTempStore()
      store.saveTunnel(tunnel1)
      store.saveTunnel(tunnel2)
      store.removeTunnel('site-1')
      expect(store.getTunnels()).toEqual([tunnel2])
      cleanup()
    })
  })

  describe('domain bindings', () => {
    it('saves and retrieves domain binding', () => {
      const { store, cleanup } = createTempStore()
      store.saveDomainBinding('site-1', 'example.com')
      expect(store.getDomainBinding('site-1')).toEqual({ siteId: 'site-1', domain: 'example.com' })
      cleanup()
    })

    it('returns null for non-existent binding', () => {
      const { store, cleanup } = createTempStore()
      expect(store.getDomainBinding('site-1')).toBeNull()
      cleanup()
    })

    it('replaces domain binding for same siteId', () => {
      const { store, cleanup } = createTempStore()
      store.saveDomainBinding('site-1', 'old.com')
      store.saveDomainBinding('site-1', 'new.com')
      expect(store.getDomainBinding('site-1')).toEqual({ siteId: 'site-1', domain: 'new.com' })
      cleanup()
    })

    it('removes domain binding', () => {
      const { store, cleanup } = createTempStore()
      store.saveDomainBinding('site-1', 'example.com')
      store.removeDomainBinding('site-1')
      expect(store.getDomainBinding('site-1')).toBeNull()
      cleanup()
    })
  })

  describe('persistence', () => {
    it('persists data across instances', () => {
      const { storePath, store, cleanup } = createTempStore()
      store.addSite({ id: 'site-1', name: 'test', serveMode: 'static', folderPath: '/tmp/test' })
      const store2 = new FileStore(storePath)
      expect(store2.getSites()).toEqual([{ id: 'site-1', name: 'test', serveMode: 'static', folderPath: '/tmp/test' }])
      cleanup()
    })
  })

  describe('corrupt data recovery', () => {
    it('returns defaults when file contains invalid JSON', () => {
      const { storePath, cleanup } = createTempStore()
      writeFileSync(storePath, 'not valid json{{{')
      const store2 = new FileStore(storePath)
      expect(store2.getSites()).toEqual([])
      cleanup()
    })
  })
})
