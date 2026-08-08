<template>
  <div class="login-page">
    <div class="login-card">
      <div class="login-header">
        <el-icon :size="40" color="#409eff"><Lock /></el-icon>
        <h1 class="login-title">Password Manager</h1>
        <p class="login-subtitle">Scan the QR code to login</p>
      </div>

      <div class="qr-area" v-loading="qrLoading">
        <img
          v-if="qrCodeUrl"
          :src="qrCodeUrl"
          alt="Login QR Code"
          class="qr-image"
        />
        <div v-if="status === 'EXPIRED'" class="qr-expired-overlay">
          <p>QR code expired</p>
          <el-button type="primary" @click="fetchQrCode">Refresh</el-button>
        </div>
        <div v-if="status === 'SCANNED'" class="qr-scanned-overlay">
          <el-icon :size="48" color="#409eff"><Check /></el-icon>
          <p>Scanned, confirming on phone...</p>
        </div>
      </div>

      <div class="login-footer">
        <p class="login-tip">Open the mobile app and scan this QR code</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { getQrCode, getLoginStatus } from '@/api/auth'
import { useAuthStore } from '@/stores/auth'
import { ElMessage } from 'element-plus'
import { Lock, Check } from '@element-plus/icons-vue'

const router = useRouter()
const authStore = useAuthStore()

const qrCodeUrl = ref('')
const ticket = ref('')
const status = ref<string>('WAITING')
const qrLoading = ref(false)
let pollTimer: ReturnType<typeof setInterval> | null = null

async function fetchQrCode() {
  qrLoading.value = true
  status.value = 'WAITING'
  try {
    const res = await getQrCode()
    qrCodeUrl.value = res.data.qrCodeUrl
    ticket.value = res.data.ticket
    startPolling()
  } catch {
    ElMessage.error('Failed to get QR code')
  } finally {
    qrLoading.value = false
  }
}

function startPolling() {
  stopPolling()
  pollTimer = setInterval(async () => {
    if (!ticket.value) return
    try {
      const res = await getLoginStatus(ticket.value)
      status.value = res.data.status

      if (res.data.status === 'CONFIRMED' && res.data.token) {
        stopPolling()
        authStore.setToken(res.data.token)
        ElMessage.success('Login successful')

        const isSet = await authStore.checkMasterPasswordStatus()
        if (!isSet) {
          router.push('/setup')
        } else {
          router.push('/')
        }
      } else if (res.data.status === 'EXPIRED') {
        stopPolling()
      }
    } catch {
      // silent, will retry
    }
  }, 2000)
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

onMounted(() => {
  fetchQrCode()
})

onUnmounted(() => {
  stopPolling()
})
</script>

<style scoped>
.login-page {
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.login-card {
  background: #fff;
  border-radius: 16px;
  padding: 48px;
  width: 420px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15);
  text-align: center;
}

.login-header {
  margin-bottom: 32px;
}

.login-title {
  font-size: 24px;
  font-weight: 600;
  color: #1d1e2c;
  margin: 12px 0 8px;
}

.login-subtitle {
  font-size: 14px;
  color: #909399;
}

.qr-area {
  width: 260px;
  height: 260px;
  margin: 0 auto;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #e4e7ed;
  border-radius: 12px;
  overflow: hidden;
}

.qr-image {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.qr-expired-overlay,
.qr-scanned-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(255, 255, 255, 0.95);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
}

.qr-expired-overlay p,
.qr-scanned-overlay p {
  font-size: 14px;
  color: #606266;
}

.login-footer {
  margin-top: 24px;
}

.login-tip {
  font-size: 13px;
  color: #909399;
}
</style>
