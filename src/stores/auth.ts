import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getMasterPasswordStatus, verifyMasterPassword } from '@/api/auth'
import router from '@/router'

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string>(localStorage.getItem('token') || '')
  const xToken = ref<string>(localStorage.getItem('xToken') || '')
  const masterPasswordSet = ref<boolean>(true)
  const isLoggedIn = ref<boolean>(!!localStorage.getItem('token'))

  function setToken(newToken: string) {
    token.value = newToken
    localStorage.setItem('token', newToken)
    isLoggedIn.value = true
  }

  function setXToken(newXToken: string) {
    xToken.value = newXToken
    localStorage.setItem('xToken', newXToken)
  }

  function clearTokens() {
    token.value = ''
    xToken.value = ''
    localStorage.removeItem('token')
    localStorage.removeItem('xToken')
    isLoggedIn.value = false
  }

  async function checkMasterPasswordStatus(): Promise<boolean> {
    try {
      const res = await getMasterPasswordStatus()
      masterPasswordSet.value = res.data.masterPasswordSet
      return res.data.masterPasswordSet
    } catch {
      return false
    }
  }

  async function verifyMasterPwd(masterPassword: string): Promise<boolean> {
    try {
      const res = await verifyMasterPassword(masterPassword)
      if (res.data.token) {
        setXToken(res.data.token)
        return true
      }
      return false
    } catch {
      return false
    }
  }

  function logout() {
    clearTokens()
    router.push('/login')
  }

  return {
    token,
    xToken,
    masterPasswordSet,
    isLoggedIn,
    setToken,
    setXToken,
    clearTokens,
    checkMasterPasswordStatus,
    verifyMasterPwd,
    logout,
  }
})
