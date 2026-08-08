import { defineStore } from 'pinia'
import { ref } from 'vue'

/**
 * Crypto state store
 *
 * Tracks the lifecycle of client-side encryption keys:
 *  - URK (User Root Key) — derived from master password, never persisted
 *  - DEK (Data Encryption Key) — encrypted by URK, downloaded from server
 *  - Device keypair (Ed25519) — generated locally, private key never leaves device
 *
 * Security: all keys are held in CryptoKey objects (extractable: false)
 * and are NOT stored in localStorage or sessionStorage.
 */
export const useCryptoStore = defineStore('crypto', () => {
  const isUnlocked = ref(false)
  const urkReady = ref(false)
  const dekReady = ref(false)
  const deviceKeyReady = ref(false)

  function setUnlocked(value: boolean) {
    isUnlocked.value = value
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

  function lock() {
    isUnlocked.value = false
    urkReady.value = false
    dekReady.value = false
  }

  function destroy() {
    isUnlocked.value = false
    urkReady.value = false
    dekReady.value = false
    deviceKeyReady.value = false
  }

  return {
    isUnlocked,
    urkReady,
    dekReady,
    deviceKeyReady,
    setUnlocked,
    setUrkReady,
    setDekReady,
    setDeviceKeyReady,
    lock,
    destroy,
  }
})
