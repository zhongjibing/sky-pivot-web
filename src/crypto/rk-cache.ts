/**
 * Record Key (RK) cache management
 *
 * RKs are derived per-record and cached in IndexedDB encrypted by a
 * cache key derived from URK via HKDF. Cache entries expire after 7 days.
 */

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000

export async function cacheRecordKey(
  _itemId: string,
  _rk: Uint8Array,
  _urk: CryptoKey,
): Promise<void> {
  throw new Error('Not implemented — Phase 2.1.4')
}

export async function getCachedRecordKey(
  _itemId: string,
  _urk: CryptoKey,
): Promise<Uint8Array | null> {
  throw new Error('Not implemented — Phase 2.1.4')
}

export async function evictExpiredKeys(): Promise<void> {
  throw new Error('Not implemented — Phase 2.1.4')
}

export { CACHE_TTL_MS }
