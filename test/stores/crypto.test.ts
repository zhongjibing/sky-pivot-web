import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useCryptoStore } from '@/stores/crypto'
import { setDek, clearDek, getDek, encryptDEK, decryptDEK } from '@/crypto/vault'
import { clearRKCacheKey } from '@/crypto/rk-cache'
import { clearSearchIndexKey } from '@/crypto/search'
import { clearSecureMemory, trackedSecureBufferCount } from '@/crypto/memory'
import { getVaultDek } from '@/api/auth'

vi.mock('@/api/auth', () => ({
  getVaultDek: vi.fn(),
}))

vi.mock('@/crypto/vault', async (importOriginal) => {
  const actual = (await importOriginal()) as any
  return {
    ...actual,
    decryptDEK: vi.fn(),
  }
})

vi.mock('@/crypto/urk', () => ({
  deriveURK: vi.fn(),
  terminateWorker: vi.fn(),
}))

vi.mock('@/crypto/rk-cache', async (importOriginal) => {
  const actual = (await importOriginal()) as any
  return {
    ...actual,
    initRKCache: vi.fn(),
  }
})

vi.mock('@/crypto/search', async (importOriginal) => {
  const actual = (await importOriginal()) as any
  return {
    ...actual,
    initSearchIndex: vi.fn(),
  }
})

vi.mock('@/stores/passwords', () => ({
  usePasswordsStore: vi.fn(() => ({
    fetchList: vi.fn(),
    list: { value: [] },
  })),
}))

vi.mock('@/stores/sync', () => ({
  useSyncStore: vi.fn(() => ({
    checkVersion: vi.fn(),
  })),
}))

describe('useCryptoStore', () => {
  beforeEach(() => {
    const pinia = createPinia()
    setActivePinia(pinia)

    localStorage.clear()

    // Reset DEK
    clearDek()

    // Clear crypto module state
    clearRKCacheKey()
    clearSearchIndexKey()
    clearSecureMemory()
    vi.clearAllMocks()
  })

  describe('initial state', () => {
    it('starts with all flags false', () => {
      const store = useCryptoStore()
      expect(store.isUnlocked).toBe(false)
      expect(store.urkReady).toBe(false)
      expect(store.dekReady).toBe(false)
      expect(store.deviceKeyReady).toBe(false)
    })

    it('idle timeout defaults to 5 minutes', () => {
      const store = useCryptoStore()
      expect(store.idleTimeout).toBe(5 * 60 * 1000)
    })
  })

  describe('lock()', () => {
    it('sets all ready flags to false', () => {
      const store = useCryptoStore()
      store.setUnlocked(true)
      store.setUrkReady(true)
      store.setDekReady(true)

      store.lock()

      expect(store.isUnlocked).toBe(false)
      expect(store.urkReady).toBe(false)
      expect(store.dekReady).toBe(false)
    })

    it('does not clear deviceKeyReady', () => {
      const store = useCryptoStore()
      store.setDeviceKeyReady(true)

      store.lock()

      expect(store.deviceKeyReady).toBe(true)
    })

    it('sets localStorage locked key', () => {
      const store = useCryptoStore()
      store.lock()
      expect(localStorage.getItem('sky-pivot-locked')).toBe('1')
    })

    it('clears global DEK', () => {
      // Set a mock DEK
      const mockDek = {} as CryptoKey
      setDek(mockDek)

      const store = useCryptoStore()
      store.lock()

      expect(getDek()).toBeNull()
    })

    it('clears tracked secure memory', () => {
      const store = useCryptoStore()
      store.lock()
      // Memory tracker should be empty after lock
      expect(trackedSecureBufferCount()).toBe(0)
    })
  })

  describe('destroy()', () => {
    it('sets all flags to false including deviceKeyReady', () => {
      const store = useCryptoStore()
      store.setUnlocked(true)
      store.setUrkReady(true)
      store.setDekReady(true)
      store.setDeviceKeyReady(true)

      store.destroy()

      expect(store.isUnlocked).toBe(false)
      expect(store.urkReady).toBe(false)
      expect(store.dekReady).toBe(false)
      expect(store.deviceKeyReady).toBe(false)
    })

    it('removes localStorage locked key', () => {
      const store = useCryptoStore()
      store.destroy()
      expect(localStorage.getItem('sky-pivot-locked')).toBeNull()
    })
  })

  describe('isPersistedLocked()', () => {
    it('returns false when no locked flag in localStorage', () => {
      const store = useCryptoStore()
      expect(store.isPersistedLocked()).toBe(false)
    })

    it('returns true when locked flag is set', () => {
      localStorage.setItem('sky-pivot-locked', '1')
      const store = useCryptoStore()
      expect(store.isPersistedLocked()).toBe(true)
    })
  })

  describe('setIdleTimeout()', () => {
    it('changes the idle timeout value', () => {
      const store = useCryptoStore()
      store.setIdleTimeout(3 * 60 * 1000)
      expect(store.idleTimeout).toBe(3 * 60 * 1000)
    })
  })

  describe('setUnlocked()', () => {
    it('removes locked key when setting unlocked to true', () => {
      localStorage.setItem('sky-pivot-locked', '1')
      const store = useCryptoStore()
      store.setUnlocked(true)
      expect(localStorage.getItem('sky-pivot-locked')).toBeNull()
    })

    it('does not remove locked key when setting unlocked to false', () => {
      localStorage.setItem('sky-pivot-locked', '1')
      const store = useCryptoStore()
      store.setUnlocked(false)
      expect(localStorage.getItem('sky-pivot-locked')).toBe('1')
    })
  })

  describe('verifyPassword()', () => {
    it('returns true for correct password', async () => {
      const mockUrk = {} as CryptoKey
      const mockDek = {} as CryptoKey
      const { deriveURK } = await import('@/crypto/urk')
      const { decryptDEK } = await import('@/crypto/vault')

      vi.mocked(deriveURK).mockResolvedValue(mockUrk)
      vi.mocked(decryptDEK).mockResolvedValue(mockDek)
      vi.mocked(getVaultDek).mockResolvedValue({
        salt: btoa('mock-salt-123456789012'),
        encryptedDek: btoa('mock-encrypted-dek-data'),
      } as any)

      const originalExportKey = crypto.subtle.exportKey
      crypto.subtle.exportKey = vi.fn().mockResolvedValue(new ArrayBuffer(8)) as any

      const store = useCryptoStore()
      const result = await store.verifyPassword('correct-password')
      expect(result).toBe(true)

      crypto.subtle.exportKey = originalExportKey
    })

    it('returns false for wrong password', async () => {
      const { deriveURK } = await import('@/crypto/urk')
      const { decryptDEK } = await import('@/crypto/vault')

      vi.mocked(deriveURK).mockResolvedValue({} as CryptoKey)
      vi.mocked(decryptDEK).mockRejectedValue(new Error('decryption failed'))
      vi.mocked(getVaultDek).mockResolvedValue({
        salt: btoa('mock-salt-123456789012'),
        encryptedDek: btoa('mock-encrypted-dek-data'),
      } as any)

      const store = useCryptoStore()
      const result = await store.verifyPassword('wrong-password')
      expect(result).toBe(false)
    })

    it('returns false when server returns no data', async () => {
      vi.mocked(getVaultDek).mockResolvedValue(null as any)

      const store = useCryptoStore()
      const result = await store.verifyPassword('any-password')
      expect(result).toBe(false)
    })
  })
})
