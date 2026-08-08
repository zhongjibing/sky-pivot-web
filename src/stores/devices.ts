import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface TrustedDevice {
  id: string
  deviceName: string
  platform: string
  lastSeen: string
  authorized: boolean
  authLevel: 1 | 2 | 3
}

export const useDevicesStore = defineStore('devices', () => {
  const devices = ref<TrustedDevice[]>([])
  const loading = ref(false)

  async function fetchDevices() {
    loading.value = true
    try {
      // API call — Phase 2.2.8
    } finally {
      loading.value = false
    }
  }

  async function revokeDevice(_deviceId: string) {
    // API call — Phase 2.2.8
  }

  async function authorizeDevice(_payload: {
    deviceId: string
    authLevel: number
    verificationCode?: string
    fingerprintCode?: string
    recoveryCode?: string
  }) {
    // API call — Phase 2.2.8
  }

  return {
    devices,
    loading,
    fetchDevices,
    revokeDevice,
    authorizeDevice,
  }
})
