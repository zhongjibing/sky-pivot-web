import { defineStore } from 'pinia'
import { ref } from 'vue'
import { clearDek, setDek, decryptDEK } from '@/crypto/vault'
import { deriveURK, terminateWorker } from '@/crypto/urk'
import { clearRKCacheKey, initRKCache } from '@/crypto/rk-cache'
import { clearSearchIndexKey, initSearchIndex } from '@/crypto/search'
import { clearSecureMemory, memzero } from '@/crypto/memory'
import { getVaultDek } from '@/api/auth'
import { usePasswordsStore } from '@/stores/passwords'
import { useSyncStore } from '@/stores/sync'

const LOCKED_KEY = 'sky-pivot-locked'

export const useCryptoStore = defineStore('crypto', () => {
  const isUnlocked = ref(false)
  const urkReady = ref(false)
  const dekReady = ref(false)
  const deviceKeyReady = ref(false)
  const unlockLoading = ref(false)
  const unlockError = ref('')
  const idleTimeout = ref(5 * 60 * 1000)

  function setUnlocked(value: boolean) {
    isUnlocked.value = value
    if (value) {
      localStorage.removeItem(LOCKED_KEY)
    }
  }

  function setUrkReady(value: boolean) {
    urkReady.value = value
  }

  function setDekReady(value: boolean) {
    dekReady.value = value
  }

  function setDeviceKeyReady(value: boolean) {
    deviceKeyReady.value = value
  }

  function setIdleTimeout(ms: number) {
    idleTimeout.value = ms
  }

  function isPersistedLocked(): boolean {
    return localStorage.getItem(LOCKED_KEY) === '1'
  }

  function lock() {
    clearDek()
    clearRKCacheKey()
    clearSearchIndexKey()
    clearSecureMemory()
    terminateWorker()

    isUnlocked.value = false
    urkReady.value = false
    dekReady.value = false

    try {
      localStorage.setItem(LOCKED_KEY, '1')
    } catch {
      // localStorage may be unavailable in some contexts
    }
  }

  function destroy() {
    clearDek()
    clearRKCacheKey()
    clearSearchIndexKey()
    clearSecureMemory()
    terminateWorker()

    isUnlocked.value = false
    urkReady.value = false
    dekReady.value = false
    deviceKeyReady.value = false

    try {
      localStorage.removeItem(LOCKED_KEY)
    } catch {
      // localStorage may be unavailable in some contexts
    }
  }

  async function verifyPassword(masterPassword: string): Promise<boolean> {
    try {
      const dekResp = await getVaultDek()
      if (!dekResp || !dekResp.salt) return false

      const salt = Uint8Array.from(atob(dekResp.salt), c => c.charCodeAt(0))
      const urk = await deriveURK(masterPassword, salt)

      const encryptedDekBytes = Uint8Array.from(
        atob(dekResp.encryptedDek),
        c => c.charCodeAt(0),
      )
      const dek = await decryptDEK(encryptedDekBytes.buffer, urk)

      const urkRaw = await crypto.subtle.exportKey('raw', urk)
      memzero(new Uint8Array(urkRaw))

      return true
    } catch {
      return false
    }
  }

  async function unlock(masterPassword: string): Promise<void> {
    unlockError.value = ''
    unlockLoading.value = true

    const passBytes = new TextEncoder().encode(masterPassword)

    try {
      const dekResp = await getVaultDek()
      if (!dekResp || !dekResp.salt) {
        throw new Error('No vault DEK returned from server')
      }

      const salt = Uint8Array.from(atob(dekResp.salt), c => c.charCodeAt(0))

      const urk = await deriveURK(masterPassword, salt)

      const encryptedDekBytes = Uint8Array.from(
        atob(dekResp.encryptedDek),
        c => c.charCodeAt(0),
      )
      const dek = await decryptDEK(encryptedDekBytes.buffer, urk)
      setDek(dek)

      const urkRawForDerivedKeys = await crypto.subtle.exportKey('raw', urk)
      await initRKCache(urkRawForDerivedKeys)
      await initSearchIndex(urkRawForDerivedKeys)

      const passwordsStore = usePasswordsStore()
      await passwordsStore.fetchList()

      const syncStore = useSyncStore()
      try {
        await syncStore.checkVersion()
      } catch {
        // sync check is optional during unlock
      }

      setUrkReady(true)
      setDekReady(true)
      isUnlocked.value = true

      try {
        localStorage.removeItem(LOCKED_KEY)
      } catch {
        // localStorage may be unavailable in some contexts
      }

      memzero(passBytes)
      memzero(new Uint8Array(urkRawForDerivedKeys))
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Unlock failed'
      unlockError.value = msg
      clearDek()
      throw e
    } finally {
      unlockLoading.value = false
    }
  }

  return {
    isUnlocked,
    urkReady,
    dekReady,
    deviceKeyReady,
    unlockLoading,
    unlockError,
    idleTimeout,
    setUnlocked,
    setUrkReady,
    setDekReady,
    setDeviceKeyReady,
    setIdleTimeout,
    lock,
    destroy,
    unlock,
    verifyPassword,
    isPersistedLocked,
  }
})
