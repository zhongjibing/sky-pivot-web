<template>
  <el-dialog
    :model-value="visible"
    title="Authorize New Device"
    width="500px"
    :close-on-click-modal="false"
    @update:model-value="$emit('update:visible', $event)"
  >
    <el-steps :active="step" align-center class="auth-steps">
      <el-step title="Select Level" />
      <el-step title="Verify" />
      <el-step title="Complete" />
    </el-steps>

    <div v-if="step === 0" class="step-body">
      <p class="step-desc">Choose authorization level for the new device:</p>
      <el-radio-group v-model="authLevel" class="level-radios">
        <el-card
          v-for="level in levels"
          :key="level.value"
          :class="['level-card', { active: authLevel === level.value }]"
          shadow="hover"
          @click="authLevel = level.value"
        >
          <div class="level-header">
            <el-icon :size="24" :color="level.color"><component :is="level.icon" /></el-icon>
            <strong>{{ level.label }}</strong>
          </div>
          <p class="level-desc">{{ level.desc }}</p>
        </el-card>
      </el-radio-group>
    </div>

    <div v-else-if="step === 1" class="step-body">
      <p class="step-desc">{{ levelConfig.detailDesc }}</p>
      <div v-if="authLevel === 1" class="qr-section">
        <div class="qr-placeholder">
          <el-icon :size="80" color="#c0c4cc"><Phone /></el-icon>
          <p>QR code will appear here</p>
        </div>
      </div>
      <el-form v-else-if="authLevel === 2" class="verify-form">
        <el-form-item label="Verification Code">
          <el-input
            v-model="verificationCode"
            placeholder="Enter verification code"
            maxlength="6"
          />
        </el-form-item>
        <el-form-item label="Fingerprint">
          <el-input
            v-model="fingerprintCode"
            placeholder="Enter fingerprint code"
          />
        </el-form-item>
      </el-form>
    </div>

    <template #footer>
      <el-button @click="handleCancel">Cancel</el-button>
      <el-button
        v-if="step < 2"
        type="primary"
        :loading="loading"
        @click="handleNext"
      >
        {{ step === 0 ? 'Next' : 'Authorize' }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { Phone, ChatDotRound, Warning } from '@element-plus/icons-vue'

defineProps({
  visible: { type: Boolean, default: false },
})

defineEmits<{
  'update:visible': [value: boolean]
  authorized: []
}>()

const step = ref(0)
const loading = ref(false)
const authLevel = ref(1)
const verificationCode = ref('')
const fingerprintCode = ref('')

const levels = [
  { value: 1, label: 'Level 1 — Scan QR', color: '#67c23a', icon: Phone, desc: 'Direct transfer via QR code. Both devices must be nearby.', detailDesc: 'Scan the QR code with the device you want to authorize.' },
  { value: 2, label: 'Level 2 — Remote', color: '#409eff', icon: ChatDotRound, desc: 'Remote authorization with fingerprint + verification code.', detailDesc: 'Enter the verification code sent to your device and the fingerprint shown on the new device.' },
  { value: 3, label: 'Level 3 — Recovery', color: '#e6a23c', icon: Warning, desc: 'Emergency access with recovery code. 1 hour validity, cannot view passwords.', detailDesc: 'Enter your 12-word recovery code to authorize a new device. This device will have 1 hour access and cannot view existing passwords.' },
]

const levelConfig = computed(() => {
  return levels.find((l) => l.value === authLevel.value) || levels[0]
})

function handleNext() {
  if (step.value === 0) {
    step.value = 1
    return
  }
  loading.value = true
  setTimeout(() => {
    loading.value = false
    ElMessage.success('Device authorized successfully')
    // emit authorized — Phase 2.2.8
  }, 1500)
}

function handleCancel() {
  step.value = 0
}
</script>

<style scoped>
.auth-steps {
  margin-bottom: 24px;
}
.step-body {
  min-height: 200px;
}
.step-desc {
  color: #606266;
  margin-bottom: 16px;
}
.level-radios {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
}
.level-card {
  cursor: pointer;
  border: 2px solid transparent;
  transition: border-color .2s;
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
.qr-section {
  display: flex;
  justify-content: center;
  margin: 24px 0;
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
}
.verify-form {
  margin-top: 16px;
}
</style>
