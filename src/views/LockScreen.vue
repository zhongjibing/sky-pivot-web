<template>
  <div class="lockscreen-overlay">
    <div class="lockscreen-card">
      <div class="lockscreen-header">
        <el-icon :size="48" color="#409eff"><Lock /></el-icon>
        <h1 class="lockscreen-title">Vault Locked</h1>
        <p class="lockscreen-subtitle">
          Your vault has been locked due to 5 minutes of inactivity.
          Enter your master password to unlock.
        </p>
      </div>

      <el-alert
        v-if="cryptoStore.unlockError"
        :title="cryptoStore.unlockError"
        type="error"
        :closable="false"
        show-icon
        class="mb-16"
      />

      <el-form ref="formRef" :model="form" :rules="rules" label-position="top" @submit.prevent="handleUnlock">
        <el-form-item label="Master Password" prop="password">
          <el-input
            v-model="form.password"
            type="password"
            placeholder="Enter your master password"
            show-password
            :disabled="cryptoStore.unlockLoading"
            @keyup.enter="handleUnlock"
          />
        </el-form-item>
        <el-form-item>
          <el-button
            type="primary"
            :loading="cryptoStore.unlockLoading"
            class="full-btn"
            @click="handleUnlock"
          >
            {{ cryptoStore.unlockLoading ? 'Unlocking...' : 'Unlock Vault' }}
          </el-button>
        </el-form-item>
      </el-form>

      <div class="lockscreen-footer">
        <el-button type="danger" text @click="handleLogout">Sign Out</el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'
import type { FormInstance, FormRules } from 'element-plus'
import { Lock } from '@element-plus/icons-vue'
import { useCryptoStore } from '@/stores/crypto'
import { useAuthStore } from '@/stores/auth'
import { useSyncStore } from '@/stores/sync'

const cryptoStore = useCryptoStore()
const authStore = useAuthStore()
const syncStore = useSyncStore()

const formRef = ref<FormInstance>()
const form = reactive({
  password: '',
})

const rules: FormRules<typeof form> = {
  password: [
    { required: true, message: 'Please enter your master password', trigger: 'blur' },
  ],
}

async function handleUnlock() {
  if (!formRef.value) return
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return

  try {
    await cryptoStore.unlock(form.password)
    form.password = ''
  } catch {
    const at = localStorage.getItem('at')
    const atExpires = localStorage.getItem('atExpiresAt')
    const hasValidAt = at && atExpires && Date.now() < new Date(atExpires).getTime()

    if (!hasValidAt) {
      syncStore.stopPolling()
      authStore.clearTokens()
    }
  }
}

function handleLogout() {
  cryptoStore.destroy()
  syncStore.stopPolling()
  authStore.logout()
}
</script>

<style scoped>
.lockscreen-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(29, 30, 44, 0.95);
  backdrop-filter: blur(12px);
}

.lockscreen-card {
  width: 420px;
  max-width: 90vw;
  background: #fff;
  border-radius: 12px;
  padding: 40px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.24);
}

.lockscreen-header {
  text-align: center;
  margin-bottom: 24px;
}

.lockscreen-title {
  font-size: 22px;
  font-weight: 600;
  color: #303133;
  margin: 12px 0 4px;
}

.lockscreen-subtitle {
  font-size: 13px;
  color: #909399;
  margin: 0;
  line-height: 1.6;
}

.full-btn {
  width: 100%;
}

.mb-16 {
  margin-bottom: 16px;
}

.lockscreen-footer {
  text-align: center;
  margin-top: 8px;
}
</style>
