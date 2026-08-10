<template>
  <div class="login-page">
    <div class="login-card">
      <div class="login-header">
        <el-icon :size="40" color="#409eff"><Lock /></el-icon>
        <h1 class="login-title">Sky Pivot</h1>
        <p class="login-subtitle">Zero-Trust Password Manager</p>
      </div>

      <el-form ref="formRef" :model="form" :rules="rules" label-position="top" @submit.prevent="handleLogin">
        <el-form-item label="Email / Username" prop="identifier">
          <el-input v-model="form.identifier" placeholder="Enter your email or username" />
        </el-form-item>
        <el-form-item label="Master Password" prop="password">
          <el-input
            v-model="form.password"
            type="password"
            placeholder="Enter your master password"
            show-password
          />
        </el-form-item>
        <el-alert v-if="authStore.loginError" :title="authStore.loginError" type="error" :closable="false" show-icon class="mb-16" />
        <el-form-item>
          <el-button type="primary" :loading="authStore.loginLoading" class="full-btn" @click="handleLogin">
            {{ authStore.loginLoading ? loginStatusText : 'Login' }}
          </el-button>
        </el-form-item>
      </el-form>

      <div class="login-footer">
        <p>Don't have an account? <router-link to="/register">Create Account</router-link></p>
        <p><router-link to="/recover">Lost your password?</router-link></p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import type { FormInstance, FormRules } from 'element-plus'
import { Lock } from '@element-plus/icons-vue'
import { useAuthStore } from '@/stores/auth'
import { useCryptoStore } from '@/stores/crypto'
import { opaqueLoginStart, opaqueLoginFinish, credentialIdentifier } from '@/crypto/opaque'
import { deriveURK } from '@/crypto/urk'
import { decryptDEK, setDek } from '@/crypto/vault'
import { createAccessTokenPayload, signAccessToken } from '@/crypto/at-signer'
import { decryptPrivateKey } from '@/crypto/device'
import { initRKCache } from '@/crypto/rk-cache'
import { initSearchIndex } from '@/crypto/search'
import { getItem } from '@/db/indexeddb'
import { opaqueLoginStart as apiLoginStart, opaqueLoginFinish as apiLoginFinish, tokenExchange, getVaultDek } from '@/api/auth'
import { pullSync } from '@/api/sync'
import { memzero } from '@/crypto/memory'

const router = useRouter()
const authStore = useAuthStore()
const cryptoStore = useCryptoStore()

const formRef = ref<FormInstance>()
const form = reactive({
  identifier: '',
  password: '',
})

const loginStatusText = ref('')

const rules: FormRules<typeof form> = {
  identifier: [{ required: true, message: 'Please enter your email or username', trigger: 'blur' }],
  password: [{ required: true, message: 'Please enter your master password', trigger: 'blur' }],
}

async function handleLogin() {
  if (!formRef.value) return
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return

  authStore.setLoginError('')
  authStore.setLoginLoading(true)
  const passBytes = new TextEncoder().encode(form.password)

  try {
    loginStatusText.value = 'Starting OPAQUE login...'

    const credId = credentialIdentifier(form.identifier)

    const loginStartResult = opaqueLoginStart(form.password)
    loginStatusText.value = 'OPAQUE KE1→KE2 exchange...'

    const ke2Resp = await apiLoginStart({
      credentialIdentifierBase64: credId,
      blindedElementBase64: loginStartResult.blindedElementBase64,
      clientNonceBase64: loginStartResult.clientNonceBase64,
      clientAkePublicKeyBase64: loginStartResult.clientAkePublicKeyBase64,
    })

    if (!ke2Resp || !ke2Resp.evaluatedElementBase64) {
      throw new Error('Invalid server response: missing KE2 fields')
    }

    loginStatusText.value = 'OPAQUE KE3 verification...'

    const finishResult = opaqueLoginFinish(loginStartResult.state, {
      evaluatedElementBase64: ke2Resp.evaluatedElementBase64,
      maskingNonceBase64: ke2Resp.maskingNonceBase64,
      maskedResponseBase64: ke2Resp.maskedResponseBase64,
      serverNonceBase64: ke2Resp.serverNonceBase64,
      serverAkePublicKeyBase64: ke2Resp.serverAkePublicKeyBase64,
      serverMacBase64: ke2Resp.serverMacBase64,
    })

    const finResp = await apiLoginFinish({
      sessionToken: ke2Resp.sessionToken,
      credentialIdentifierBase64: credId,
      clientMacBase64: finishResult.clientMacBase64,
    })

    const st = finResp.sessionToken
    if (!st) throw new Error('No session token returned')
    authStore.setSessionToken(st)
    localStorage.setItem('st', st)

    loginStatusText.value = 'Loading device key...'

    const deviceKeyData = await getItem<{ encryptedKey: string; publicKey: string }>('sky-pivot-vault', 'deviceKey', 'device-key')
    if (!deviceKeyData) {
      throw new Error('Device key not found. This device has not been authorized. Please register or authorize this device.')
    }

    const urk = await deriveURK(form.password, new Uint8Array(0)) // Placeholder salt; real salt will come from server
    const encryptedKeyBytes = Uint8Array.from(atob(deviceKeyData.encryptedKey), c => c.charCodeAt(0))
    const devicePrivateKey = await decryptPrivateKey(encryptedKeyBytes, urk)
    cryptoStore.setUrkReady(true)
    cryptoStore.setDeviceKeyReady(true)

    loginStatusText.value = 'Exchanging ST for AT...'

    const atPayload = createAccessTokenPayload(finResp.userId, deviceKeyData.publicKey.substring(0, 8))
    const at = await signAccessToken(atPayload, devicePrivateKey)

    const exchResp = await tokenExchange({ accessToken: at })

    if (!exchResp || !exchResp.userId) {
      throw new Error('Token exchange failed')
    }

    authStore.setAccessToken(at, exchResp.atExpiresAt)
    authStore.setUserInfo(exchResp.userId, exchResp.deviceId)

    loginStatusText.value = 'Downloading vault data...'

    const dekResp = await getVaultDek()
    if (!dekResp || !dekResp.salt) {
      throw new Error('No vault DEK returned from server')
    }

    const salt = Uint8Array.from(atob(dekResp.salt), c => c.charCodeAt(0))

    const urkFromSalt = await deriveURK(form.password, salt)

    const encryptedDekBytes = Uint8Array.from(atob(dekResp.encryptedDek), c => c.charCodeAt(0))
    const dek = await decryptDEK(encryptedDekBytes.buffer, urkFromSalt)
    setDek(dek)
    cryptoStore.setDekReady(true)

    loginStatusText.value = 'Syncing vault items...'

    const urkRawForDerivedKeys = await crypto.subtle.exportKey('raw', urkFromSalt)
    await initRKCache(urkRawForDerivedKeys)
    await initSearchIndex(urkRawForDerivedKeys)
    memzero(new Uint8Array(urkRawForDerivedKeys))

    const syncResp = await pullSync(0)
    const encryptedItems = (syncResp as any).changes || []

    if (encryptedItems.length > 0) {
      // Encrypted items are pulled from server; field-level decryption is deferred
      // to the vault store which handles decryption on demand via DEK
    }

    cryptoStore.setUnlocked(true)
    memzero(passBytes)

    loginStatusText.value = ''

    router.push('/')
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Login failed'
    authStore.setLoginError(msg)
    cryptoStore.lock()
  } finally {
    authStore.setLoginLoading(false)
    loginStatusText.value = ''
  }
}
</script>

<style scoped>
.login-page {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}
.login-card {
  width: 440px;
  max-width: 90vw;
  background: #fff;
  border-radius: 12px;
  padding: 40px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
}
.login-header {
  text-align: center;
  margin-bottom: 24px;
}
.login-title {
  font-size: 22px;
  font-weight: 600;
  color: #303133;
  margin: 12px 0 4px;
}
.login-subtitle {
  font-size: 13px;
  color: #909399;
  margin: 0;
}
.full-btn {
  width: 100%;
}
.mb-16 {
  margin-bottom: 16px;
}
.login-footer {
  text-align: center;
  margin-top: 16px;
  font-size: 13px;
  color: #909399;
}
.login-footer a {
  color: #409eff;
  text-decoration: none;
}
.login-footer p {
  margin: 4px 0;
}
</style>
