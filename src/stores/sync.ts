import { defineStore } from 'pinia'
import { ref } from 'vue'
import { checkSyncVersion, pullSync } from '@/api/sync'

export const useSyncStore = defineStore('sync', () => {
  const version = ref(0)
  const pollingTimer = ref<ReturnType<typeof setInterval> | null>(null)

  async function checkVersion() {
    try {
      const res = await checkSyncVersion()
      const newVersion = res.data.version
      if (newVersion > version.value && version.value > 0) {
        await pullChanges(version.value)
      }
      version.value = newVersion
    } catch {
      // silent
    }
  }

  async function pullChanges(sinceVersion: number) {
    try {
      await pullSync(sinceVersion)
    } catch {
      // silent
    }
  }

  function startPolling(intervalMs = 30000) {
    stopPolling()
    checkVersion()
    pollingTimer.value = setInterval(checkVersion, intervalMs)
  }

  function stopPolling() {
    if (pollingTimer.value) {
      clearInterval(pollingTimer.value)
      pollingTimer.value = null
    }
  }

  return {
    version,
    pollingTimer,
    checkVersion,
    pullChanges,
    startPolling,
    stopPolling,
  }
})
