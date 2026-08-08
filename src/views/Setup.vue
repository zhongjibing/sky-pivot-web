<template>
  <div class="setup-page">
    <div class="setup-card" v-if="!setupComplete">
      <div class="setup-header">
        <el-icon :size="40" color="#e6a23c"><WarningFilled /></el-icon>
        <h1 class="setup-title">Set Up Master Password</h1>
        <p class="setup-desc">
          The master password is used to encrypt and decrypt all your sensitive data.
          It is critical that you remember this password — it cannot be recovered if forgotten.
        </p>
      </div>

      <el-form
        ref="formRef"
        :model="form"
        :rules="rules"
        label-position="top"
        @submit.prevent="handleSubmit"
      >
        <el-form-item label="Master Password" prop="masterPassword">
          <el-input
            v-model="form.masterPassword"
            type="password"
            placeholder="Enter master password"
            show-password
            size="large"
          />
        </el-form-item>

        <div class="strength-bar" v-if="form.masterPassword">
          <div class="strength-track">
            <div
              class="strength-fill"
              :style="{ width: strengthPercent + '%', backgroundColor: strengthColor }"
            />
          </div>
          <span class="strength-text" :style="{ color: strengthColor }">{{ strengthLabel }}</span>
        </div>

        <div class="rules-list">
          <div class="rule-item" :class="{ pass: hasMinLength }">
            <el-icon><CircleCheckFilled v-if="hasMinLength" /><CircleCloseFilled v-else /></el-icon>
            <span>At least 10 characters</span>
          </div>
          <div class="rule-item" :class="{ pass: hasUppercase }">
            <el-icon><CircleCheckFilled v-if="hasUppercase" /><CircleCloseFilled v-else /></el-icon>
            <span>Contains uppercase letter</span>
          </div>
          <div class="rule-item" :class="{ pass: hasLowercase }">
            <el-icon><CircleCheckFilled v-if="hasLowercase" /><CircleCloseFilled v-else /></el-icon>
            <span>Contains lowercase letter</span>
          </div>
          <div class="rule-item" :class="{ pass: hasDigit }">
            <el-icon><CircleCheckFilled v-if="hasDigit" /><CircleCloseFilled v-else /></el-icon>
            <span>Contains digit</span>
          </div>
          <div class="rule-item" :class="{ pass: hasSpecial }">
            <el-icon><CircleCheckFilled v-if="hasSpecial" /><CircleCloseFilled v-else /></el-icon>
            <span>Contains special character</span>
          </div>
        </div>

        <el-form-item label="Confirm Master Password" prop="confirmPassword">
          <el-input
            v-model="form.confirmPassword"
            type="password"
            placeholder="Confirm master password"
            show-password
            size="large"
          />
        </el-form-item>

        <el-form-item>
          <el-button
            type="primary"
            size="large"
            native-type="submit"
            :loading="loading"
            :disabled="!allRulesPass"
            style="width: 100%;"
          >
            Set Master Password
          </el-button>
        </el-form-item>
      </el-form>
    </div>

    <div class="setup-card" v-else>
      <div class="setup-complete">
        <el-icon :size="60" color="#f56c6c"><WarningFilled /></el-icon>
        <h2>Important Warning</h2>
        <div class="warning-box">
          <p>
            The master password is the <strong>only way</strong> to decrypt your data.
            If you forget it, your data <strong>cannot be recovered</strong>.
          </p>
          <p>Please make sure to remember your master password or store it safely.</p>
        </div>
        <el-button type="primary" size="large" @click="goToPasswords">
          I understand, continue
        </el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { setupMasterPassword } from '@/api/auth'
import { checkStrength } from '@/api/utils'
import { ElMessage } from 'element-plus'
import { WarningFilled, CircleCheckFilled, CircleCloseFilled } from '@element-plus/icons-vue'
import type { FormInstance } from 'element-plus'

const router = useRouter()
const formRef = ref<FormInstance>()
const loading = ref(false)
const setupComplete = ref(false)
const strengthScore = ref(0)
const strengthLevel = ref('')

const form = reactive({
  masterPassword: '',
  confirmPassword: '',
})

const rules = {
  masterPassword: [
    { required: true, message: 'Please enter master password', trigger: 'blur' },
  ],
  confirmPassword: [
    { required: true, message: 'Please confirm master password', trigger: 'blur' },
    {
      validator: (_rule: any, value: string, callback: any) => {
        if (value !== form.masterPassword) {
          callback(new Error('Passwords do not match'))
        } else {
          callback()
        }
      },
      trigger: 'blur',
    },
  ],
}

const hasMinLength = computed(() => form.masterPassword.length >= 10)
const hasUppercase = computed(() => /[A-Z]/.test(form.masterPassword))
const hasLowercase = computed(() => /[a-z]/.test(form.masterPassword))
const hasDigit = computed(() => /[0-9]/.test(form.masterPassword))
const hasSpecial = computed(() => /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(form.masterPassword))
const allRulesPass = computed(() =>
  hasMinLength.value && hasUppercase.value && hasLowercase.value && hasDigit.value && hasSpecial.value
)

const strengthPercent = computed(() => strengthScore.value)

const strengthColor = computed(() => {
  const level = strengthLevel.value.toLowerCase().replace(/[\s_-]/g, '')
  if (level === 'weak') return '#f56c6c'
  if (level === 'fair') return '#e6a23c'
  if (level === 'strong') return '#409eff'
  if (level === 'verystrong') return '#67c23a'
  return '#909399'
})

const strengthLabel = computed(() => {
  const level = strengthLevel.value.toLowerCase().replace(/[\s_-]/g, '')
  if (level === 'weak') return 'Weak'
  if (level === 'fair') return 'Fair'
  if (level === 'strong') return 'Strong'
  if (level === 'verystrong') return 'Very Strong'
  return ''
})

let strengthTimer: ReturnType<typeof setTimeout> | null = null
function debouncedCheckStrength() {
  if (strengthTimer) clearTimeout(strengthTimer)
  strengthTimer = setTimeout(async () => {
    if (form.masterPassword) {
      try {
        const res = await checkStrength(form.masterPassword)
        strengthScore.value = res.data.score
        strengthLevel.value = res.data.level
      } catch {
        // silent
      }
    }
  }, 300)
}

import { watch } from 'vue'
watch(() => form.masterPassword, debouncedCheckStrength)

async function handleSubmit() {
  if (!formRef.value) return
  await formRef.value.validate(async (valid) => {
    if (!valid) return
    if (!allRulesPass.value) {
      ElMessage.warning('Password does not meet all complexity requirements')
      return
    }
    loading.value = true
    try {
      await setupMasterPassword(form.masterPassword)
      setupComplete.value = true
    } catch {
      ElMessage.error('Failed to set master password')
    } finally {
      loading.value = false
    }
  })
}

function goToPasswords() {
  router.push('/')
}
</script>

<style scoped>
.setup-page {
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.setup-card {
  background: #fff;
  border-radius: 16px;
  padding: 48px;
  width: 520px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15);
}

.setup-header {
  text-align: center;
  margin-bottom: 32px;
}

.setup-title {
  font-size: 22px;
  font-weight: 600;
  color: #1d1e2c;
  margin: 12px 0 8px;
}

.setup-desc {
  font-size: 14px;
  color: #909399;
  line-height: 1.6;
}

.strength-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.strength-track {
  flex: 1;
  height: 6px;
  background: #ebeef5;
  border-radius: 3px;
  overflow: hidden;
}

.strength-fill {
  height: 100%;
  border-radius: 3px;
  transition: width 0.3s, background-color 0.3s;
}

.strength-text {
  font-size: 13px;
  font-weight: 500;
  min-width: 80px;
}

.rules-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 20px;
  padding: 12px;
  background: #f5f7fa;
  border-radius: 8px;
}

.rule-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #909399;
}

.rule-item.pass {
  color: #67c23a;
}

.setup-complete {
  text-align: center;
}

.setup-complete h2 {
  font-size: 20px;
  margin: 16px 0;
  color: #1d1e2c;
}

.warning-box {
  background: #fef0f0;
  border: 1px solid #fde2e2;
  border-radius: 8px;
  padding: 20px;
  margin: 20px 0 32px;
  text-align: left;
}

.warning-box p {
  font-size: 14px;
  color: #606266;
  line-height: 1.8;
}
</style>
