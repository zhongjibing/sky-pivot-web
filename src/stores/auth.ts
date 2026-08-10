import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { CryptoKey } from '@/crypto'
import { useCryptoStore } from '@/stores/crypto'
import router from '@/router'

/**
 * OPAQUE auth store — manages ST/AT tokens and session state.
 *
 * Token lifecycle:
 *  ST (Session Token): Server-signed Ed25519 JWT, 15-min TTL.
 *    Only valid for POST /api/auth/opaque/token-exchange.
 *  AT (Access Token): Client-signed Ed25519 JWT, 2-hour TTL.
 *    Used for all API operations. Signed by device private key.
 */
export const useAuthStore = defineStore('auth', () => {
  const sessionToken = ref<string>('')
  const accessToken = ref<string>('')
  const atExpiresAt = ref<string>('')
  const userId = ref<string>('')
  const deviceId = ref<string>('')
  const isLoggedIn = ref<boolean>(false)
  const loginError = ref<string>('')
  const loginLoading = ref<boolean>(false)

  function setLoginLoading(val: boolean) {
    loginLoading.value = val
  }

  function setLoginError(err: string) {
    loginError.value = err
  }

  function clearLoginError() {
    loginError.value = ''
  }

  function setSessionToken(st: string) {
    sessionToken.value = st
    localStorage.setItem('st', st)
  }

  function setAccessToken(at: string, expiresAt: string) {
    accessToken.value = at
    atExpiresAt.value = expiresAt
    localStorage.setItem('at', at)
    localStorage.setItem('atExpiresAt', expiresAt)
  }

  function setUserInfo(uid: string, did: string) {
    userId.value = uid
    deviceId.value = did
    isLoggedIn.value = true
    localStorage.setItem('userId', uid)
    localStorage.setItem('deviceId', did)
  }

  function loadStoredState() {
    const storedAt = localStorage.getItem('at')
    const storedAtExpires = localStorage.getItem('atExpiresAt')
    const storedUserId = localStorage.getItem('userId')
    const storedDeviceId = localStorage.getItem('deviceId')

    if (storedAt && storedAtExpires) {
      const expiresAt = new Date(storedAtExpires).getTime()
      if (Date.now() < expiresAt) {
        accessToken.value = storedAt
        atExpiresAt.value = storedAtExpires
        userId.value = storedUserId || ''
        deviceId.value = storedDeviceId || ''
        isLoggedIn.value = true
        return true
      }
    }
    return false
  }

  function clearTokens() {
    sessionToken.value = ''
    accessToken.value = ''
    atExpiresAt.value = ''
    userId.value = ''
    deviceId.value = ''
    isLoggedIn.value = false
    loginError.value = ''
    loginLoading.value = false
    localStorage.removeItem('st')
    localStorage.removeItem('at')
    localStorage.removeItem('atExpiresAt')
    localStorage.removeItem('userId')
    localStorage.removeItem('deviceId')
    localStorage.removeItem('token')
    localStorage.removeItem('xToken')
  }

  function logout() {
    clearTokens()
    router.push('/login')
  }

  async function verifyMasterPwd(masterPassword: string): Promise<boolean> {
    const cryptoStore = useCryptoStore()
    return cryptoStore.verifyPassword(masterPassword)
  }

  return {
    sessionToken,
    accessToken,
    atExpiresAt,
    userId,
    deviceId,
    isLoggedIn,
    loginError,
    loginLoading,
    setLoginLoading,
    setLoginError,
    clearLoginError,
    setSessionToken,
    setAccessToken,
    setUserInfo,
    loadStoredState,
    clearTokens,
    logout,
    verifyMasterPwd,
  }
})
