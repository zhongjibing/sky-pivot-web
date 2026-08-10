<template>
  <div class="register-page">
    <div class="register-card">
      <div class="register-header">
        <el-icon :size="40" color="#409eff"><Lock /></el-icon>
        <h1 class="register-title">Create Account</h1>
        <p class="register-subtitle">{{ stepTitles[step] }}</p>
      </div>

      <!-- Progress indicator -->
      <div class="step-progress">
        <div class="step-indicators">
          <span v-for="i in 4" :key="i" class="step-dot" :class="{ active: step >= i - 1, done: step > i - 1 }" />
        </div>
      </div>

      <!-- Step 0: Account Info -->
      <template v-if="step === 0">
        <el-form ref="formRef" :model="form" :rules="rules" label-position="top">
          <el-form-item label="Email / Username" prop="identifier">
            <el-input v-model="form.identifier" placeholder="Enter your email or username" />
          </el-form-item>
          <el-form-item label="Master Password" prop="password">
            <el-input
              v-model="form.password"
              type="password"
              placeholder="Min 12 chars — at least 3 categories: upper, lower, digit, special"
              show-password
              @input="checkPasswordStrength"
            />
            <div class="strength-bar" v-if="passwordStrength">
              <div class="strength-fill" :class="passwordStrength.level" :style="{ width: passwordStrength.score + '%' }" />
              <span class="strength-label">{{ passwordStrength.label }}</span>
            </div>
            <div class="criteria-list" v-if="passwordCriteria.length">
              <span v-for="c in passwordCriteria" :key="c.label" class="criteria" :class="{ met: c.met }">
                {{ c.met ? '\u2713' : '\u2717' }} {{ c.label }}
              </span>
            </div>
          </el-form-item>
          <el-form-item label="Confirm Master Password" prop="confirmPassword">
            <el-input v-model="form.confirmPassword" type="password" placeholder="Re-enter master password" show-password />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" :loading="step0Loading" class="full-btn" @click="handleStep0">
              Continue
            </el-button>
          </el-form-item>
        </el-form>
      </template>

      <!-- Step 1: Generating Keys -->
      <template v-if="step === 1">
        <div class="generating-keys">
          <el-icon :size="48" class="is-loading spinning"><Loading /></el-icon>
          <p>Generating encryption keys on your device...</p>
          <div class="key-status">
            <div class="status-line"><span :class="{ done: keys.salt }">\u25CF</span> Random salt</div>
            <div class="status-line"><span :class="{ done: keys.urk }">\u25CF</span> Master key (URK via PBKDF2)</div>
            <div class="status-line"><span :class="{ done: keys.dek }">\u25CF</span> Data encryption key (DEK)</div>
            <div class="status-line"><span :class="{ done: keys.deviceKey }">\u25CF</span> Device Ed25519 key pair</div>
            <div class="status-line"><span :class="{ done: keys.opaque }">\u25CF</span> Zero-knowledge registration</div>
            <div class="status-line"><span :class="{ done: keys.recovery }">\u25CF</span> Recovery code</div>
          </div>
        </div>
      </template>

      <!-- Step 2: Recovery Code -->
      <template v-if="step === 2">
        <el-alert title="Your account has been created!" type="success" :closable="false" show-icon class="mb-16" />
        <RecoveryCodeDisplay v-if="recoveryWords.length" :words="recoveryWords" />
        <div v-if="showRecoveryConfirm" class="recovery-verify">
          <p class="verify-title">Enter the following words to confirm you've saved them:</p>
          <div v-for="pos in [3, 6, 9]" :key="pos" class="word-verify-line">
            <span class="pos-label">Word #{{ pos }}:</span>
            <el-input
              v-model="recoveryConfirms[pos]"
              class="word-input"
              :placeholder="'Enter word ' + pos"
              :class="{ error: recoveryConfirms[pos] && recoveryConfirms[pos] !== recoveryWords[pos - 1] }"
            />
            <span v-if="recoveryConfirms[pos] && recoveryConfirms[pos] === recoveryWords[pos - 1]" class="word-ok">\u2713</span>
          </div>
          <el-button
            type="success"
            :disabled="!allRecoveryWordsConfirmed"
            :loading="enteringVault"
            class="full-btn"
            @click="finishRegistration"
          >
            I've Saved My Recovery Code
          </el-button>
        </div>
      </template>

      <!-- Step 3: Security Warning & Done -->
      <template v-if="step === 3">
        <div class="done-section">
          <el-icon :size="48" color="#67c23a"><CircleCheckFilled /></el-icon>
          <h2>Registration Complete</h2>
          <el-alert title="IMPORTANT" type="warning" :closable="false" show-icon class="mb-16">
            <p><strong>Your master password cannot be recovered.</strong> If you lose it, you'll need your recovery code.</p>
            <p>Store both securely. Nobody — not even us — can access your data without them.</p>
          </el-alert>
          <el-button type="primary" class="full-btn" @click="goToLogin">Go to Login</el-button>
        </div>
      </template>

      <div class="register-footer" v-if="step === 0">
        <p>Already have an account? <router-link to="/login">Login</router-link></p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import type { FormInstance, FormRules } from 'element-plus'
import { ElMessage } from 'element-plus'
import { Lock, Loading, CircleCheckFilled } from '@element-plus/icons-vue'
import RecoveryCodeDisplay from '@/components/RecoveryCodeDisplay.vue'
import { opaqueRegisterStart, opaqueRegisterFinish, credentialIdentifier } from '@/crypto/opaque'
import { createRecoveryBundle } from '@/crypto/recovery'
import { deriveURK } from '@/crypto/urk'
import { generateStorableKeyPair, encryptPrivateKey } from '@/crypto/device'
import { encryptDEK } from '@/crypto/vault'
import { opaqueRegisterStart as apiRegisterStart, opaqueRegisterFinish as apiRegisterFinish } from '@/api/auth'
import { memzero } from '@/crypto/memory'
import type { OpaqueRegState } from '@/crypto/opaque'

const router = useRouter()

interface RegisterForm {
  identifier: string
  password: string
  confirmPassword: string
}

const stepTitles = ['Account Info', 'Generating Keys...', 'Save Recovery Code', 'Complete']

const formRef = ref<FormInstance>()
const step = ref(0)
const step0Loading = ref(false)
const enteringVault = ref(false)
const showRecoveryConfirm = ref(false)

const form = reactive<RegisterForm>({
  identifier: '',
  password: '',
  confirmPassword: '',
})

const keys = reactive({
  salt: false,
  urk: false,
  dek: false,
  deviceKey: false,
  opaque: false,
  recovery: false,
})

const recoveryWords = ref<string[]>([])
const recoveryConfirms = reactive<Record<number, string>>({ 3: '', 6: '', 9: '' })

const passwordStrength = ref<{ level: string; score: number; label: string } | null>(null)
const passwordCriteria = ref<{ label: string; met: boolean }[]>([])

const allRecoveryWordsConfirmed = computed(() => {
  return (
    recoveryConfirms[3] === recoveryWords.value[2] &&
    recoveryConfirms[6] === recoveryWords.value[5] &&
    recoveryConfirms[9] === recoveryWords.value[8]
  )
})

function checkPasswordStrength() {
  const pwd = form.password
  if (!pwd) {
    passwordStrength.value = null
    passwordCriteria.value = []
    return
  }
  const hasUpper = /[A-Z]/.test(pwd)
  const hasLower = /[a-z]/.test(pwd)
  const hasDigit = /\d/.test(pwd)
  const hasSpecial = /[^A-Za-z0-9]/.test(pwd)
  const lengthOk = pwd.length >= 12

  passwordCriteria.value = [
    { label: '12+ characters', met: lengthOk },
    { label: 'Uppercase letter', met: hasUpper },
    { label: 'Lowercase letter', met: hasLower },
    { label: 'Number', met: hasDigit },
    { label: 'Special character', met: hasSpecial },
  ]

  const cats = [hasUpper, hasLower, hasDigit, hasSpecial].filter(Boolean).length
  let level: string, score: number, label: string
  if (lengthOk && cats >= 3) {
    level = 'strong'; score = 100; label = 'Strong'
  } else if (lengthOk && cats >= 2) {
    level = 'fair'; score = 66; label = 'Fair'
  } else if (pwd.length >= 8 && cats >= 2) {
    level = 'weak'; score = 33; label = 'Weak'
  } else {
    level = 'weak'; score = 10; label = 'Too weak'
  }
  passwordStrength.value = { level, score, label }
}

const rules: FormRules<RegisterForm> = {
  identifier: [{ required: true, message: 'Please enter your email or username', trigger: 'blur' }],
  password: [
    { required: true, message: 'Please create a master password', trigger: 'blur' },
    { min: 12, message: 'Password must be at least 12 characters', trigger: 'blur' },
    {
      validator: (_rule, _value, cb) => {
        const cats = passwordCriteria.value.filter(c => c.met).length
        if (cats < 3) cb(new Error('At least 3 of: upper, lower, digit, special'))
        else cb()
      },
      trigger: 'blur',
    },
  ],
  confirmPassword: [
    { required: true, message: 'Please confirm your master password', trigger: 'blur' },
    {
      validator: (_rule, value, cb) => {
        if (value !== form.password) cb(new Error('Passwords do not match'))
        else cb()
      },
      trigger: 'blur',
    },
  ],
}

async function handleStep0() {
  if (!formRef.value) return
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return
  step0Loading.value = true
  step.value = 1

  try {
    const passBytes = new TextEncoder().encode(form.password)

    // Key generation
    keys.salt = false
    const salt = crypto.getRandomValues(new Uint8Array(16))
    keys.salt = true

    // Derive URK
    keys.urk = false
    const urk = await deriveURK(form.password, salt)
    keys.urk = true

    // Generate DEK
    keys.dek = false
    const dekRaw = crypto.getRandomValues(new Uint8Array(32))
    const encryptedDek = await encryptDEK(dekRaw, urk)
    keys.dek = true

    // Generate device key pair
    keys.deviceKey = false
    const deviceKeys = await generateStorableKeyPair()
    const encryptedDeviceKey = await encryptPrivateKey(deviceKeys.privateKeyRaw, urk)
    memzero(deviceKeys.privateKeyRaw)
    keys.deviceKey = true

    // OPAQUE registration
    keys.opaque = false
    const credId = credentialIdentifier(form.identifier)
    const { blindedElementBase64, state } = opaqueRegisterStart(form.password)

    const regStartResp = await apiRegisterStart({
      credentialIdentifierBase64: credId,
      blindedElementBase64,
    })

    const regResult = opaqueRegisterFinish(
      state,
      regStartResp.evaluatedElementBase64,
      regStartResp.serverPublicKeyBase64,
    )

    await apiRegisterFinish({
      credentialIdentifierBase64: credId,
      clientPublicKeyBase64: regResult.clientPublicKeyBase64,
      maskingKeyBase64: regResult.maskingKeyBase64,
      envelopeNonceBase64: regResult.envelopeNonceBase64,
      authTagBase64: regResult.authTagBase64,
    })
    keys.opaque = true

    // Generate recovery code
    keys.recovery = false
    const bundle = await createRecoveryBundle(urk)
    keys.recovery = true

    recoveryWords.value = bundle.words
    memzero(passBytes)

    // Cleanup URK from memory (store encrypted form)
    // TODO: Store encryptedDek, salt, encryptedDeviceKey, bundle data in IndexedDB
    // TODO: Upload salt, encryptedDek, device public key, recovery data to server

    setTimeout(() => {
      step.value = 2
      showRecoveryConfirm.value = true
    }, 500)
  } catch (e: unknown) {
    ElMessage.error('Registration failed: ' + ((e as Error).message || String(e)))
    step.value = 0
  } finally {
    step0Loading.value = false
  }
}

function finishRegistration() {
  enteringVault.value = true
  setTimeout(() => {
    enteringVault.value = false
    step.value = 3
  }, 300)
}

function goToLogin() {
  router.push('/login')
}
</script>

<style scoped>
.register-page {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}
.register-card {
  width: 480px;
  max-width: 90vw;
  background: #fff;
  border-radius: 12px;
  padding: 40px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
}
.register-header {
  text-align: center;
  margin-bottom: 24px;
}
.register-title {
  font-size: 22px;
  font-weight: 600;
  color: #303133;
  margin: 12px 0 4px;
}
.register-subtitle {
  font-size: 13px;
  color: #909399;
  margin: 0;
}
.step-progress {
  display: flex;
  justify-content: center;
  margin-bottom: 24px;
}
.step-indicators {
  display: flex;
  gap: 8px;
}
.step-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #dcdfe6;
  transition: all 0.3s;
}
.step-dot.active {
  background: #409eff;
  box-shadow: 0 0 0 4px rgba(64, 158, 255, 0.2);
}
.step-dot.done {
  background: #67c23a;
}
.strength-bar {
  margin-top: 6px;
  height: 6px;
  border-radius: 3px;
  background: #ebeef5;
  overflow: hidden;
  position: relative;
}
.strength-fill {
  height: 100%;
  border-radius: 3px;
  transition: width 0.3s;
}
.strength-fill.weak { background: #f56c6c; }
.strength-fill.fair { background: #e6a23c; }
.strength-fill.strong { background: #67c23a; }
.strength-label {
  position: absolute;
  right: 0;
  top: -18px;
  font-size: 11px;
  color: #909399;
}
.criteria-list {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  margin-top: 6px;
}
.criteria {
  font-size: 11px;
  color: #c0c4cc;
}
.criteria.met {
  color: #67c23a;
}
.full-btn {
  width: 100%;
}
.generating-keys {
  text-align: center;
  padding: 24px 0;
}
.generating-keys p {
  margin: 12px 0 20px;
  color: #606266;
}
.key-status {
  text-align: left;
  display: inline-block;
}
.status-line {
  padding: 4px 0;
  font-size: 13px;
  color: #c0c4cc;
}
.status-line span {
  margin-right: 8px;
  font-size: 10px;
}
.status-line .done {
  color: #67c23a;
}
.spinning {
  animation: spin 1.5s linear infinite;
}
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
.mb-16 {
  margin-bottom: 16px;
}
.recovery-verify {
  margin-top: 20px;
}
.verify-title {
  font-size: 13px;
  color: #606266;
  margin-bottom: 12px;
}
.word-verify-line {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}
.pos-label {
  font-size: 13px;
  color: #303133;
  min-width: 70px;
}
.word-input {
  width: 180px;
}
.word-input.error :deep(.el-input__inner) {
  border-color: #f56c6c;
}
.word-ok {
  color: #67c23a;
  font-size: 18px;
}
.done-section {
  text-align: center;
  padding: 16px 0;
}
.done-section h2 {
  font-size: 20px;
  color: #303133;
  margin: 12px 0 16px;
}
.register-footer {
  text-align: center;
  margin-top: 16px;
  font-size: 13px;
  color: #909399;
}
.register-footer a {
  color: #409eff;
  text-decoration: none;
}
</style>
