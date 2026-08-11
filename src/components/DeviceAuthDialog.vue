<template>
  <el-dialog
    :model-value="visible"
    title="Authorize New Device"
    width="580px"
    :close-on-click-modal="false"
    :close-on-press-escape="false"
    @update:model-value="$emit('update:visible', $event)"
    @closed="handleClosed"
  >
    <el-steps :active="step" align-center class="auth-steps" v-if="step >= 0">
      <el-step title="Select Method" />
      <el-step title="Authorize" />
      <el-step title="Complete" />
    </el-steps>

    <el-alert
      v-if="store.authError"
      :title="store.authError"
      type="error"
      :closable="false"
      show-icon
      class="mb-16"
    />

    <div v-if="step === 0" class="step-body">
      <p class="step-desc">Choose authorization method for the new device:</p>
      <div class="level-cards">
        <el-card
          v-for="level in levels"
          :key="level.value"
          :class="['level-card', { active: selectedLevel === level.value }]"
          shadow="hover"
          @click="selectedLevel = level.value"
        >
          <div class="level-header">
            <el-icon :size="24" :color="level.color"><component :is="level.icon" /></el-icon>
            <strong>{{ level.label }}</strong>
          </div>
          <p class="level-desc">{{ level.desc }}</p>
        </el-card>
      </div>
    </div>

    <div v-else-if="step === 1" class="step-body">
      <div v-if="level1Flow" class="level-flow">
        <p class="flow-desc">{{ levels[0].detailDesc }}</p>
        <div class="qr-section">
          <canvas ref="qrCanvasRef" v-show="store.qrCodeData" class="qr-canvas"></canvas>
          <div v-if="!store.qrCodeData" class="qr-placeholder">
            <el-icon :size="60" color="#c0c4cc"><Loading /></el-icon>
            <p>Generating QR code...</p>
          </div>
        </div>
        <div v-if="store.authFingerprint" class="fingerprint-display">
          <span class="fingerprint-label">Device Fingerprint:</span>
          <code class="fingerprint-code">{{ store.authFingerprint }}</code>
          <el-tooltip content="Verify this fingerprint matches on the scanning device" placement="top">
            <el-icon class="fingerprint-info"><InfoFilled /></el-icon>
          </el-tooltip>
        </div>
        <el-divider content-position="left">Manual DEK Input</el-divider>
        <p class="manual-desc">If scanning is not available, paste the encrypted DEK from the authorized device:</p>
        <el-input
          v-model="manualDekInput"
          type="textarea"
          :rows="3"
          placeholder="Paste encrypted DEK here..."
          class="manual-input"
        />
      </div>

      <div v-else-if="level2Flow" class="level-flow">
        <p class="flow-desc">{{ levels[1].detailDesc }}</p>
        <div v-if="!store.authRequestId && !store.authLoading" class="initiate-section">
          <el-button type="primary" :loading="authSubmitting" @click="initiateLevel2">
            Initiate Authorization Request
          </el-button>
        </div>
        <div v-else class="waiting-section">
          <div class="waiting-indicator">
            <el-icon :size="40" class="is-loading spinning"><Loading /></el-icon>
            <p class="waiting-title">Waiting for Authorization</p>
            <p class="waiting-sub">A notification has been sent to your authorized devices.</p>
          </div>
          <div class="request-info">
            <el-descriptions :column="1" border size="small">
              <el-descriptions-item label="Request ID">{{ store.authRequestId }}</el-descriptions-item>
              <el-descriptions-item label="Fingerprint">
                <code>{{ store.authFingerprint }}</code>
              </el-descriptions-item>
              <el-descriptions-item label="Expires">{{ formatTime(store.authExpiresAt) }}</el-descriptions-item>
            </el-descriptions>
          </div>
          <div class="poll-section">
            <el-button :loading="polling" @click="pollDek">Check for Authorization</el-button>
            <span v-if="polling" class="poll-hint">Auto-checking every 5 seconds...</span>
          </div>
        </div>
      </div>

      <div v-else-if="level3Flow" class="level-flow">
        <p class="flow-desc">{{ levels[2].detailDesc }}</p>
        <el-form label-position="top" v-if="!store.emergencyRequestId">
          <el-form-item label="Email / Username">
            <el-input v-model="credentialIdentifier" placeholder="Enter your account email or username" />
          </el-form-item>
          <el-button type="primary" :loading="authSubmitting" @click="initiateEmergency">
            Request Challenge
          </el-button>
        </el-form>
        <div v-else class="emergency-form">
          <el-alert
            title="Emergency Authorization"
            type="warning"
            :closable="false"
            show-icon
            description="This device will have 1 hour access. You cannot view existing passwords. A new recovery code will be generated."
            class="mb-16"
          />
          <el-form label-position="top">
            <el-form-item label="SMS Verification Code">
              <el-input
                v-model="store.smsCode"
                placeholder="6-digit code sent to your phone"
                maxlength="6"
              />
            </el-form-item>
          </el-form>
          <p class="recovery-title">Enter your 12-word recovery code:</p>
          <div class="recovery-word-grid">
            <div v-for="i in 12" :key="i" class="recovery-word-item">
              <span class="word-index">{{ i }}</span>
              <el-input
                :model-value="store.recoveryWords[i - 1]"
                @update:model-value="(val: string) => store.setRecoveryWord(i - 1, val)"
                size="small"
                :placeholder="'word ' + i"
              />
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-else-if="step === 2" class="step-body">
      <div class="complete-section">
        <el-icon :size="48" color="#67c23a"><CircleCheckFilled /></el-icon>
        <h3>Device Authorized</h3>
        <p v-if="level3Flow && store.emergencyRequestId" class="emergency-warning">
          <el-alert type="warning" :closable="false" show-icon>
            <strong>Emergency mode active.</strong> You must set a new master password and generate a new recovery code. Old recovery code is now invalid.
          </el-alert>
        </p>
        <p v-else>Your device has been successfully authorized.</p>
      </div>
    </div>

    <template #footer>
      <el-button @click="handleCancel">{{ step === 2 ? 'Close' : 'Cancel' }}</el-button>
      <el-button
        v-if="step === 0"
        type="primary"
        @click="handleNext"
      >
        Next
      </el-button>
      <el-button
        v-if="step === 1 && level2Flow && store.authRequestId"
        type="primary"
        :loading="polling"
        @click="pollDek"
      >
        Check Authorization
      </el-button>
      <el-button
        v-if="step === 1 && level3Flow && store.emergencyRequestId"
        type="primary"
        :loading="store.authLoading"
        @click="submitEmergency"
      >
        Verify & Activate
      </el-button>
      <el-button
        v-if="step === 2"
        type="primary"
        @click="finishAndClose"
      >
        Done
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { ElMessage } from 'element-plus'
import { Phone, ChatDotRound, Warning, Loading, CircleCheckFilled, InfoFilled } from '@element-plus/icons-vue'
import QRCode from 'qrcode'
import { useDevicesStore } from '@/stores/devices'

defineProps({
  visible: { type: Boolean, default: false },
})

defineEmits<{
  'update:visible': [value: boolean]
  authorized: []
}>()

const store = useDevicesStore()
const step = ref(0)
const selectedLevel = ref(1)
const qrCanvasRef = ref<HTMLCanvasElement | null>(null)
const manualDekInput = ref('')
const credentialIdentifier = ref('')
const authSubmitting = ref(false)
const polling = ref(false)
let pollTimer: ReturnType<typeof setInterval> | null = null

const levels = [
  {
    value: 1,
    label: 'Level 1 — Scan QR',
    color: '#67c23a',
    icon: Phone,
    desc: 'Direct transfer via QR code. Both devices must be nearby.',
    detailDesc: 'Scan the QR code below with your authorized device to transfer encryption keys directly.',
  },
  {
    value: 2,
    label: 'Level 2 — Remote',
    color: '#409eff',
    icon: ChatDotRound,
    desc: 'Remote authorization with fingerprint verification. Requires an authorized device.',
    detailDesc: 'Send an authorization request to your authorized devices. They will confirm and transfer the encryption key.',
  },
  {
    value: 3,
    label: 'Level 3 — Emergency',
    color: '#e6a23c',
    icon: Warning,
    desc: 'Emergency access with recovery code + SMS. 1 hour validity. Cannot view passwords.',
    detailDesc: 'Use your 12-word recovery code and SMS verification to authorize. This device will be temporary and cannot view existing passwords.',
  },
]

const level1Flow = computed(() => selectedLevel.value === 1)
const level2Flow = computed(() => selectedLevel.value === 2)
const level3Flow = computed(() => selectedLevel.value === 3)

async function renderQRCode() {
  if (!store.qrCodeData || !qrCanvasRef.value) return
  await nextTick()
  try {
    await QRCode.toCanvas(qrCanvasRef.value, store.qrCodeData, {
      width: 200,
      margin: 2,
      color: { dark: '#303133', light: '#ffffff' },
    })
  } catch {
    // QR rendering failed
  }
}

watch(() => store.qrCodeData, () => {
  if (store.qrCodeData) {
    nextTick(() => renderQRCode())
  }
})

function formatTime(dateStr: string): string {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleString()
}

async function handleNext() {
  if (step.value === 0) {
    store.authLevel = selectedLevel.value as 1 | 2 | 3

    if (selectedLevel.value === 1) {
      await store.initLevel1Qr()
    }

    step.value = 1

    if (selectedLevel.value === 1) {
      await nextTick()
      await renderQRCode()
    }
  }
}

async function initiateLevel2() {
  authSubmitting.value = true
  try {
    await store.initLevel2AuthFlow()
  } finally {
    authSubmitting.value = false
  }
}

async function pollDek() {
  polling.value = true

  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }

  try {
    const encryptedDek = await store.pollForLevel2Dek()
    if (encryptedDek) {
      polling.value = false
      if (pollTimer) {
        clearInterval(pollTimer)
        pollTimer = null
      }
      try {
        await store.completeLevel2AuthFlow(encryptedDek)
        step.value = 2
        ElMessage.success('Device authorized successfully')
      } catch {
        ElMessage.error('Failed to complete authorization')
      }
      return
    }

    pollTimer = setInterval(async () => {
      try {
        const dek = await store.pollForLevel2Dek()
        if (dek) {
          if (pollTimer) {
            clearInterval(pollTimer)
            pollTimer = null
          }
          polling.value = false
          try {
            await store.completeLevel2AuthFlow(dek)
            step.value = 2
            ElMessage.success('Device authorized successfully')
          } catch {
            ElMessage.error('Failed to complete authorization')
          }
        } else if (store.authExpiresAt) {
          const expires = new Date(store.authExpiresAt).getTime()
          if (Date.now() > expires) {
            if (pollTimer) {
              clearInterval(pollTimer)
              pollTimer = null
            }
            polling.value = false
            ElMessage.warning('Authorization request expired')
          }
        }
      } catch {
        if (pollTimer) {
          clearInterval(pollTimer)
          pollTimer = null
        }
        polling.value = false
      }
    }, 5000)
  } catch {
    polling.value = false
  }
}

async function initiateEmergency() {
  if (!credentialIdentifier.value.trim()) {
    ElMessage.warning('Please enter your email or username')
    return
  }
  authSubmitting.value = true
  try {
    await store.initEmergencyAuth(credentialIdentifier.value.trim())
  } finally {
    authSubmitting.value = false
  }
}

async function submitEmergency() {
  const success = await store.completeEmergencyAuth()
  if (success) {
    step.value = 2
    ElMessage.success('Device authorized in emergency mode')
  }
}

function finishAndClose() {
  step.value = 0
  selectedLevel.value = 1
  manualDekInput.value = ''
  credentialIdentifier.value = ''
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
  polling.value = false
  store.resetAuth()
  ElMessage.closeAll()
}

function handleCancel() {
  if (step.value === 2) {
    finishAndClose()
  } else {
    finishAndClose()
  }
}

function handleClosed() {
  finishAndClose()
}
</script>

<style scoped>
.auth-steps {
  margin-bottom: 24px;
}
.step-body {
  min-height: 260px;
}
.step-desc {
  color: #606266;
  margin-bottom: 16px;
}
.mb-16 {
  margin-bottom: 16px;
}

.level-cards {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.level-card {
  cursor: pointer;
  border: 2px solid transparent;
  transition: border-color 0.2s;
}
.level-card.active {
  border-color: #409eff;
}
.level-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}
.level-desc {
  color: #909399;
  font-size: 13px;
  margin: 0;
}

.flow-desc {
  color: #606266;
  margin-bottom: 16px;
}

.qr-section {
  display: flex;
  justify-content: center;
  margin: 16px 0;
}
.qr-canvas {
  border-radius: 8px;
  border: 1px solid #ebeef5;
}
.qr-placeholder {
  width: 200px;
  height: 200px;
  border: 2px dashed #dcdfe6;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #c0c4cc;
  gap: 8px;
}

.fingerprint-display {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-bottom: 16px;
}
.fingerprint-label {
  font-size: 13px;
  color: #606266;
}
.fingerprint-code {
  font-family: 'Courier New', monospace;
  font-size: 16px;
  letter-spacing: 2px;
  background: #f5f7fa;
  padding: 4px 12px;
  border-radius: 4px;
  color: #303133;
}
.fingerprint-info {
  color: #909399;
  cursor: help;
}

.manual-desc {
  font-size: 12px;
  color: #909399;
  margin-bottom: 8px;
}
.manual-input {
  margin-bottom: 8px;
}

.initiate-section {
  display: flex;
  justify-content: center;
  padding: 32px 0;
}

.waiting-section {
  text-align: center;
}
.waiting-indicator {
  padding: 20px 0;
}
.waiting-title {
  font-size: 16px;
  color: #303133;
  margin: 12px 0 4px;
}
.waiting-sub {
  font-size: 13px;
  color: #909399;
  margin: 0 0 16px;
}

.request-info {
  text-align: left;
  margin-bottom: 16px;
}

.poll-section {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin-top: 12px;
}
.poll-hint {
  font-size: 12px;
  color: #909399;
}

.emergency-form {
  text-align: left;
}

.recovery-title {
  font-size: 14px;
  color: #303133;
  font-weight: 500;
  margin: 12px 0 8px;
}

.recovery-word-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}
.recovery-word-item {
  display: flex;
  align-items: center;
  gap: 4px;
}
.word-index {
  font-size: 12px;
  color: #909399;
  min-width: 20px;
  text-align: right;
}

.complete-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 24px 0;
}
.complete-section h3 {
  font-size: 18px;
  color: #303133;
  margin: 12px 0 8px;
}
.complete-section p {
  color: #606266;
  font-size: 14px;
}

.emergency-warning {
  width: 100%;
  margin-top: 12px;
  text-align: left;
}

.spinning {
  animation: spin 1.5s linear infinite;
}
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>