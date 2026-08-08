<template>
  <div class="recover-page">
    <div class="recover-card">
      <div class="recover-header">
        <el-icon :size="40" color="#e6a23c"><Warning /></el-icon>
        <h1 class="recover-title">Recover Account</h1>
        <p class="recover-subtitle">Use your 12-word BIP39 recovery code to regain access</p>
      </div>

      <el-steps :active="step" align-center class="recover-steps">
        <el-step title="Enter Code" />
        <el-step title="New Password" />
        <el-step title="Complete" />
      </el-steps>

      <div v-if="step === 0" class="step-content">
        <el-form ref="wordsFormRef" :model="wordsForm">
          <el-form-item label="Recovery Code (12 words)">
            <el-input
              v-model="wordsForm.words"
              type="textarea"
              :rows="3"
              placeholder="Enter your 12-word recovery code separated by spaces"
            />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" :loading="loading" class="step-btn" @click="handleSubmitCode">
              Verify Recovery Code
            </el-button>
          </el-form-item>
        </el-form>
      </div>

      <div v-else-if="step === 1" class="step-content">
        <el-form ref="passwordFormRef" :model="passwordForm" :rules="passwordRules">
          <el-form-item label="New Master Password" prop="password">
            <el-input v-model="passwordForm.password" type="password" placeholder="Enter new master password" show-password />
          </el-form-item>
          <el-form-item label="Confirm Password" prop="confirmPassword">
            <el-input v-model="passwordForm.confirmPassword" type="password" placeholder="Re-enter new password" show-password />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" :loading="loading" class="step-btn" @click="handleResetPassword">
              Reset Password &amp; Login
            </el-button>
          </el-form-item>
        </el-form>
      </div>

      <div v-else-if="step === 2" class="step-content step-done">
        <el-result icon="success" title="Recovery Complete" sub-title="Your account has been recovered. Redirecting to vault...">
          <template #extra>
            <el-button type="primary" @click="goToLogin">Go to Login</el-button>
          </template>
        </el-result>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const step = ref(0)
const loading = ref(false)

const wordsForm = reactive({ words: '' })
const passwordForm = reactive({ password: '', confirmPassword: '' })
const passwordRules = {
  password: [
    { required: true, message: 'Please enter a new password', trigger: 'blur' },
    { min: 8, message: 'Password must be at least 8 characters', trigger: 'blur' },
  ],
  confirmPassword: [
    { required: true, message: 'Please confirm your password', trigger: 'blur' },
    {
      validator: (_rule: unknown, value: string, cb: (err?: Error) => void) => {
        if (value !== passwordForm.password) cb(new Error('Passwords do not match'))
        else cb()
      },
      trigger: 'blur',
    },
  ],
}

async function handleSubmitCode() {
  loading.value = true
  // Challenge-Response flow — Phase 2.2.1
  step.value = 1
  loading.value = false
}

async function handleResetPassword() {
  loading.value = true
  // Recovery password reset — Phase 2.2.1
  step.value = 2
  loading.value = false
}

function goToLogin() {
  router.push('/login')
}
</script>

<style scoped>
.recover-page {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}
.recover-card {
  width: 480px;
  background: #fff;
  border-radius: 12px;
  padding: 40px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
}
.recover-header {
  text-align: center;
  margin-bottom: 28px;
}
.recover-title {
  font-size: 22px;
  font-weight: 600;
  color: #303133;
  margin: 12px 0 4px;
}
.recover-subtitle {
  font-size: 13px;
  color: #909399;
  margin: 0;
}
.recover-steps {
  margin-bottom: 32px;
}
.step-content {
  min-height: 180px;
}
.step-btn {
  width: 100%;
}
.step-done {
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
