import { describe, it, expect } from 'vitest'
import {
  initRKCache,
  clearRKCacheKey,
  isRKCacheInitialized,
  cacheRecordKey,
  getCachedRecordKey,
  evictExpiredKeys,
  CACHE_TTL_MS,
} from '@/crypto/rk-cache'
import { getDb } from '@/db/indexeddb'

function createTestURKRaw(): ArrayBuffer {
  return new Uint8Array(32).fill(0xaa).buffer as ArrayBuffer
}

function createAltURKRaw(): ArrayBuffer {
  return new Uint8Array(32).fill(0xbb).buffer as ArrayBuffer
}

describe('RK Cache', () => {
  describe('initRKCache / clearRKCacheKey', () => {
    it('derives cache key from URK raw bytes via HKDF-SHA256', async () => {
      clearRKCacheKey()
      expect(isRKCacheInitialized()).toBe(false)

      const urkRaw = createTestURKRaw()
      await initRKCache(urkRaw)

      expect(isRKCacheInitialized()).toBe(true)
    })

    it('is idempotent — calling again does not overwrite', async () => {
      clearRKCacheKey()
      const urkRaw = createTestURKRaw()
      await initRKCache(urkRaw)
      await initRKCache(urkRaw)
      expect(isRKCacheInitialized()).toBe(true)
    })

    it('different URK raw bytes cannot decrypt entries from old cache key', async () => {
      clearRKCacheKey()
      const urkRaw1 = createTestURKRaw()
      const urkRaw2 = createAltURKRaw()

      await initRKCache(urkRaw1)
      const rk = crypto.getRandomValues(new Uint8Array(32))
      await cacheRecordKey('dt-001', rk)

      const cached = await getCachedRecordKey('dt-001')
      expect(cached).not.toBeNull()
      expect(cached!).toEqual(rk)

      clearRKCacheKey()
      await initRKCache(urkRaw2)

      const wrongCached = await getCachedRecordKey('dt-001')
      expect(wrongCached).toBeNull()
    })

    it('clearRKCacheKey resets state so uninitialized errors are thrown', async () => {
      const urkRaw = createTestURKRaw()
      await initRKCache(urkRaw)
      expect(isRKCacheInitialized()).toBe(true)

      clearRKCacheKey()
      expect(isRKCacheInitialized()).toBe(false)

      await expect(getCachedRecordKey('cr-001')).rejects.toThrow(
        'RK cache not initialized',
      )
    })
  })

  describe('cacheRecordKey / getCachedRecordKey roundtrip', () => {
    it('roundtrip: cached RK equals original', async () => {
      clearRKCacheKey()
      await initRKCache(createTestURKRaw())

      const rk = crypto.getRandomValues(new Uint8Array(32))
      await cacheRecordKey('rt-001', rk)

      const cached = await getCachedRecordKey('rt-001')
      expect(cached).not.toBeNull()
      expect(cached!).toEqual(rk)
    })

    it('different item IDs store independent values', async () => {
      clearRKCacheKey()
      await initRKCache(createTestURKRaw())

      const rk1 = crypto.getRandomValues(new Uint8Array(32))
      const rk2 = crypto.getRandomValues(new Uint8Array(32))

      await cacheRecordKey('id-001', rk1)
      await cacheRecordKey('id-002', rk2)

      const cached1 = await getCachedRecordKey('id-001')
      const cached2 = await getCachedRecordKey('id-002')

      expect(cached1).toEqual(rk1)
      expect(cached2).toEqual(rk2)
    })

    it('updating cache for same item ID overwrites previous', async () => {
      clearRKCacheKey()
      await initRKCache(createTestURKRaw())

      const rk1 = crypto.getRandomValues(new Uint8Array(32))
      const rk2 = crypto.getRandomValues(new Uint8Array(32))

      await cacheRecordKey('ov-001', rk1)
      await cacheRecordKey('ov-001', rk2)

      const cached = await getCachedRecordKey('ov-001')
      expect(cached).toEqual(rk2)
    })

    it('returns null for non-existent item', async () => {
      clearRKCacheKey()
      await initRKCache(createTestURKRaw())

      const cached = await getCachedRecordKey('no-such-item')
      expect(cached).toBeNull()
    })

    it('encrypted blobs differ for same RK (different IV)', async () => {
      clearRKCacheKey()
      await initRKCache(createTestURKRaw())

      const rk = crypto.getRandomValues(new Uint8Array(32))
      await cacheRecordKey('iv-001', rk)

      const getBlob = async (): Promise<ArrayBuffer> => {
        const db = await getDb('sky-pivot-rk')
        return new Promise((resolve, reject) => {
          const tx = db.transaction('keys', 'readonly')
          const getReq = tx.objectStore('keys').get('iv-001')
          getReq.onsuccess = () => resolve(getReq.result.encryptedRk)
          getReq.onerror = () => reject(getReq.error)
        })
      }

      const blob1 = await getBlob()
      await cacheRecordKey('iv-001', rk)
      const blob2 = await getBlob()

      expect(new Uint8Array(blob1)).not.toEqual(new Uint8Array(blob2))
    })
  })

  describe('expiry', () => {
    it('returns null and deletes entry when expired', async () => {
      clearRKCacheKey()
      await initRKCache(createTestURKRaw())

      const rk = crypto.getRandomValues(new Uint8Array(32))
      await cacheRecordKey('exp-001', rk)

      const db = await getDb('sky-pivot-rk')
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('keys', 'readwrite')
        const store = tx.objectStore('keys')
        const getReq = store.get('exp-001')
        getReq.onsuccess = () => {
          getReq.result.expiresAt = Date.now() - 1000
          store.put(getReq.result)
        }
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      })

      const cached = await getCachedRecordKey('exp-001')
      expect(cached).toBeNull()
    })

    it('fresh entry within TTL is returned', async () => {
      clearRKCacheKey()
      await initRKCache(createTestURKRaw())

      const rk = crypto.getRandomValues(new Uint8Array(32))
      await cacheRecordKey('fr-001', rk)

      const cached = await getCachedRecordKey('fr-001')
      expect(cached).not.toBeNull()
      expect(cached!).toEqual(rk)
    })
  })

  describe('evictExpiredKeys', () => {
    it('removes expired entries but keeps fresh ones', async () => {
      clearRKCacheKey()
      await initRKCache(createTestURKRaw())

      const rk1 = crypto.getRandomValues(new Uint8Array(32))
      const rk2 = crypto.getRandomValues(new Uint8Array(32))

      await cacheRecordKey('ev-001', rk1)
      await cacheRecordKey('ev-002', rk2)

      const db = await getDb('sky-pivot-rk')
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('keys', 'readwrite')
        const store = tx.objectStore('keys')
        const getReq = store.get('ev-001')
        getReq.onsuccess = () => {
          getReq.result.expiresAt = Date.now() - 1000
          store.put(getReq.result)
        }
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      })

      await evictExpiredKeys()

      expect(await getCachedRecordKey('ev-001')).toBeNull()
      expect(await getCachedRecordKey('ev-002')).not.toBeNull()
    })

    it('no-op when no expired entries exist', async () => {
      clearRKCacheKey()
      await initRKCache(createTestURKRaw())

      const rk = crypto.getRandomValues(new Uint8Array(32))
      await cacheRecordKey('noev-001', rk)

      await evictExpiredKeys()

      const cached = await getCachedRecordKey('noev-001')
      expect(cached).not.toBeNull()
    })

    it('removes multiple expired entries in one call', async () => {
      clearRKCacheKey()
      await initRKCache(createTestURKRaw())

      const rk = crypto.getRandomValues(new Uint8Array(32))
      await cacheRecordKey('mev-001', rk)
      await cacheRecordKey('mev-002', rk)
      await cacheRecordKey('mev-003', rk)

      const db = await getDb('sky-pivot-rk')
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('keys', 'readwrite')
        const store = tx.objectStore('keys')
        const past = Date.now() - 1000
        ;['mev-001', 'mev-002', 'mev-003'].forEach((id) => {
          const getReq = store.get(id)
          getReq.onsuccess = () => {
            getReq.result.expiresAt = past
            store.put(getReq.result)
          }
        })
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      })

      await evictExpiredKeys()

      expect(await getCachedRecordKey('mev-001')).toBeNull()
      expect(await getCachedRecordKey('mev-002')).toBeNull()
      expect(await getCachedRecordKey('mev-003')).toBeNull()
    })
  })

  describe('error handling', () => {
    it('throws if cacheRecordKey called before init', async () => {
      clearRKCacheKey()
      await expect(
        cacheRecordKey('err-001', new Uint8Array(32)),
      ).rejects.toThrow('RK cache not initialized')
    })

    it('throws if getCachedRecordKey called before init', async () => {
      clearRKCacheKey()
      await expect(getCachedRecordKey('err-001')).rejects.toThrow(
        'RK cache not initialized',
      )
    })
  })

  describe('CACHE_TTL_MS constant', () => {
    it('is 7 days in milliseconds', () => {
      expect(CACHE_TTL_MS).toBe(7 * 24 * 60 * 60 * 1000)
      expect(CACHE_TTL_MS).toBe(604800000)
    })
  })
})
