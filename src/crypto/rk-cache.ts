/**
 * Record Key (RK) cache management
 *
 * RKs are derived per-record and cached in IndexedDB encrypted by a
 * cache key derived from URK via HKDF. Cache entries expire after 7 days.
 *
 * Derivation: HKDF-SHA256(URK_raw, salt=zero-filled, info="rk-cache", 32B)
 */

import { getDb, putItem, getItem, deleteItem } from '@/db/indexeddb'

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000
const DB_NAME = 'sky-pivot-rk'
const STORE_NAME = 'keys'
const IV_LENGTH = 12

let cacheKey: CryptoKey | null = null

interface RKCacheEntry {
  itemId: string
  encryptedRk: ArrayBuffer
  expiresAt: number
}

export async function initRKCache(urkRaw: ArrayBuffer): Promise<void> {
  if (cacheKey) return

  const hkdfSource = await crypto.subtle.importKey(
    'raw',
    urkRaw,
    { name: 'HKDF' },
    false,
    ['deriveKey'],
  )

  cacheKey = await crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(32),
      info: new TextEncoder().encode('rk-cache'),
    },
    hkdfSource,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export function clearRKCacheKey(): void {
  cacheKey = null
}

export function isRKCacheInitialized(): boolean {
  return cacheKey !== null
}

export async function cacheRecordKey(itemId: string, rkRaw: Uint8Array): Promise<void> {
  if (!cacheKey) throw new Error('RK cache not initialized. Call initRKCache first.')

  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH))
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    cacheKey,
    rkRaw as BufferSource,
  )

  const packed = new Uint8Array(iv.byteLength + ciphertext.byteLength)
  packed.set(iv, 0)
  packed.set(new Uint8Array(ciphertext), iv.byteLength)

  await putItem(DB_NAME, STORE_NAME, {
    itemId,
    encryptedRk: packed.buffer,
    expiresAt: Date.now() + CACHE_TTL_MS,
  })
}

export async function getCachedRecordKey(itemId: string): Promise<Uint8Array | null> {
  if (!cacheKey) throw new Error('RK cache not initialized. Call initRKCache first.')

  const entry = await getItem<RKCacheEntry>(DB_NAME, STORE_NAME, itemId)

  if (!entry) return null

  if (Date.now() > entry.expiresAt) {
    await deleteItem(DB_NAME, STORE_NAME, itemId)
    return null
  }

  const packed = new Uint8Array(entry.encryptedRk)
  const iv = packed.slice(0, IV_LENGTH)
  const ciphertext = packed.slice(IV_LENGTH)

  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      cacheKey,
      ciphertext,
    )
    return new Uint8Array(plaintext)
  } catch {
    await deleteItem(DB_NAME, STORE_NAME, itemId)
    return null
  }
}

export async function evictExpiredKeys(): Promise<void> {
  const db = await getDb(DB_NAME)
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const index = store.index('expiresAt')
    const range = IDBKeyRange.upperBound(Date.now())

    const req = index.openCursor(range)
    req.onsuccess = () => {
      const cursor = req.result
      if (cursor) {
        cursor.delete()
        cursor.continue()
      }
    }
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export { CACHE_TTL_MS }
