import { defineStore } from 'pinia'
import { ref } from 'vue'
import {
  getDevices,
  revokeDevice as apiRevokeDevice,
  activateDevice,
  initLevel2Auth,
  downloadLevel2Dek,
  completeLevel2Auth,
  emergencyAuthChallenge,
  emergencyAuthVerify,
  type DeviceListItem,
  type DeviceActivateResponse,
} from '@/api/devices'
import {
  generateStorableKeyPair,
  encryptPrivateKey,
  generateTempX25519KeyPair,
  computeFingerprint,
  ecdhDecryptDEK,
  bytesToHex,
} from '@/crypto/device'
import { getDek } from '@/crypto/vault'
import { memzero } from '@/crypto/memory'
import { useAuthStore } from '@/stores/auth'
import {
  deriveRecoveryKey,
  computeRecoveryKeyHash,
  validateRecoveryCode,
} from '@/crypto/recovery'
import { ElMessage } from 'element-plus'

export interface TrustedDevice {
  deviceId: string
  deviceName: string
  deviceType: string
  authorized: boolean
  revoked: boolean
  lastSeen: string | null
  createdAt: string | null
}

function base64ToBytes(b64: string): Uint8Array {
  const raw = atob(b64)
  const bytes = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) {
    bytes[i] = raw.charCodeAt(i)
  }
  return bytes
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

export const useDevicesStore = defineStore('devices', () => {
  const devices = ref<TrustedDevice[]>([])
  const loading = ref(false)

  const authLoading = ref(false)
  const authError = ref('')
  const authStep = ref(0)
  const authLevel = ref<1 | 2 | 3>(1)
  const authRequestId = ref('')
  const authFingerprint = ref('')
  const authExpiresAt = ref('')

  const qrCodeData = ref('')
  const totpCode = ref('')
  const smsCode = ref('')
  const recoveryWords = ref<string[]>(Array(12).fill(''))

  const emergencyRequestId = ref('')
  const emergencyRecoverySalt = ref('')
  const emergencyChallenge = ref('')

  async function fetchDevices() {
    loading.value = true
    try {
      const list = await getDevices()
      devices.value = list.map((d: DeviceListItem) => ({
        deviceId: d.deviceId,
        deviceName: d.deviceName,
        deviceType: d.deviceType,
        authorized: d.authorized,
        revoked: d.revoked,
        lastSeen: d.lastSeen,
        createdAt: d.createdAt,
      }))
    } catch {
      ElMessage.error('Failed to fetch devices')
    } finally {
      loading.value = false
    }
  }

  async function revokeDevice(deviceId: string) {
    try {
      await apiRevokeDevice(deviceId)
      devices.value = devices.value.filter((d) => d.deviceId !== deviceId)
      ElMessage.success('Device revoked')
    } catch {
      ElMessage.error('Failed to revoke device')
      throw new Error('Revoke failed')
    }
  }

  async function initLevel1Qr(): Promise<void> {
    authStep.value = 0
    authLevel.value = 1
    authError.value = ''

    try {
      const tempKeyPair = await generateTempX25519KeyPair()
      const pubKeyB64 = bytesToBase64(tempKeyPair.publicKey)
      const fingerprint = await computeFingerprint(pubKeyB64)

      const qrPayload = JSON.stringify({
        type: 'level1_device_auth',
        tempPublicKey: pubKeyB64,
        fingerprint,
      })

      qrCodeData.value = qrPayload
      authFingerprint.value = fingerprint

      sessionStorage.setItem('level1_temp_priv_key_hex', bytesToHex(tempKeyPair.publicKey))
      sessionStorage.setItem('level1_temp_pub_key_b64', pubKeyB64)
    } catch (e: unknown) {
      authError.value = e instanceof Error ? e.message : 'Failed to generate QR auth data'
    }
  }

  async function completeLevel1Auth(decryptedDek: Uint8Array): Promise<DeviceActivateResponse> {
    const authStore = useAuthStore()

    const deviceKeys = await generateStorableKeyPair()
    const pubKeyB64 = bytesToBase64(deviceKeys.publicKey)
    const deviceId = crypto.randomUUID()
    const deviceName = navigator.platform.includes('Win') ? 'Windows PC' :
      navigator.platform.includes('Mac') ? 'Mac PC' :
      navigator.platform.includes('Linux') ? 'Linux PC' : 'PC'

    const result = await activateDevice({
      deviceId,
      deviceName,
      deviceType: 'PC',
      ed25519PublicKey: pubKeyB64,
    })

    const urkRaw = new Uint8Array(await crypto.subtle.exportKey('raw', await getDek() as CryptoKey))
    const encryptedKey = await encryptPrivateKey(deviceKeys.privateKeyRaw, getDek() as CryptoKey)
    memzero(deviceKeys.privateKeyRaw)

    sessionStorage.removeItem('level1_temp_priv_key_hex')
    sessionStorage.removeItem('level1_temp_pub_key_b64')

    await fetchDevices()
    return result
  }

  async function initLevel2AuthFlow(): Promise<void> {
    authStep.value = 0
    authLevel.value = 2
    authError.value = ''
    authLoading.value = true

    try {
      const tempKeyPair = await generateTempX25519KeyPair()
      const pubKeyB64 = bytesToBase64(tempKeyPair.publicKey)
      const fingerprint = await computeFingerprint(pubKeyB64)

      const response = await initLevel2Auth({
        tempPublicKey: pubKeyB64,
        fingerprint,
      })

      authRequestId.value = response.requestId
      authFingerprint.value = fingerprint
      authExpiresAt.value = response.expiresAt

      sessionStorage.setItem('level2_temp_priv_key_hex', bytesToHex(tempKeyPair.publicKey))
      sessionStorage.setItem('level2_temp_pub_key_b64', pubKeyB64)
      sessionStorage.setItem('level2_request_id', response.requestId)
    } catch (e: unknown) {
      authError.value = e instanceof Error ? e.message : 'Failed to initiate Level 2 authorization'
    } finally {
      authLoading.value = false
    }
  }

  async function pollForLevel2Dek(): Promise<string | null> {
    if (!authRequestId.value) return null

    try {
      const result = await downloadLevel2Dek(authRequestId.value)
      return result.encryptedDek
    } catch {
      return null
    }
  }

  async function completeLevel2AuthFlow(encryptedDek: string): Promise<DeviceActivateResponse> {
    authLoading.value = true
    try {
      const tempPrivHex = sessionStorage.getItem('level2_temp_priv_key_hex')
      const tempPubB64 = sessionStorage.getItem('level2_temp_pub_key_b64')

      const deviceKeys = await generateStorableKeyPair()
      const pubKeyB64 = bytesToBase64(deviceKeys.publicKey)
      const deviceId = crypto.randomUUID()
      const deviceName = navigator.platform.includes('Win') ? 'Windows PC' :
        navigator.platform.includes('Mac') ? 'Mac PC' :
        navigator.platform.includes('Linux') ? 'Linux PC' : 'PC'

      const result = await completeLevel2Auth({
        requestId: authRequestId.value,
        encryptedDek,
        ed25519PublicKey: pubKeyB64,
        deviceId,
        deviceName,
        deviceType: 'PC',
      })

      const encryptedKey = await encryptPrivateKey(deviceKeys.privateKeyRaw, getDek() as CryptoKey)
      memzero(deviceKeys.privateKeyRaw)

      sessionStorage.removeItem('level2_temp_priv_key_hex')
      sessionStorage.removeItem('level2_temp_pub_key_b64')
      sessionStorage.removeItem('level2_request_id')

      await fetchDevices()
      return result
    } catch (e: unknown) {
      authError.value = e instanceof Error ? e.message : 'Failed to complete Level 2 authorization'
      throw e
    } finally {
      authLoading.value = false
    }
  }

  async function initEmergencyAuth(credentialIdentifier: string): Promise<void> {
    authStep.value = 0
    authLevel.value = 3
    authError.value = ''
    authLoading.value = true

    try {
      const response = await emergencyAuthChallenge({ credentialIdentifier })
      emergencyRequestId.value = response.requestId
      emergencyRecoverySalt.value = response.recoverySalt
      emergencyChallenge.value = response.challenge
    } catch (e: unknown) {
      authError.value = e instanceof Error ? e.message : 'Failed to initiate emergency authorization'
    } finally {
      authLoading.value = false
    }
  }

  async function completeEmergencyAuth(): Promise<boolean> {
    const words = recoveryWords.value.filter((w) => w.trim() !== '')
    if (words.length !== 12) {
      authError.value = 'Please enter all 12 recovery words'
      return false
    }

    if (!validateRecoveryCode(words)) {
      authError.value = 'Invalid recovery code — please verify your words'
      return false
    }

    if (!smsCode.value || smsCode.value.length !== 6) {
      authError.value = 'Please enter the 6-digit SMS verification code'
      return false
    }

    authLoading.value = true

    try {
      const recoverySalt = base64ToBytes(emergencyRecoverySalt.value)
      const recoveryKey = await deriveRecoveryKey(words, recoverySalt)
      const recoveryKeyHash = await computeRecoveryKeyHash(recoveryKey)
      const recoveryKeyHashHex = bytesToHex(recoveryKeyHash)

      const deviceId = crypto.randomUUID()
      const deviceKeys = await generateStorableKeyPair()
      const pubKeyB64 = bytesToBase64(deviceKeys.publicKey)
      const deviceName = navigator.platform.includes('Win') ? 'Windows PC (Emergency)' :
        navigator.platform.includes('Mac') ? 'Mac PC (Emergency)' :
        navigator.platform.includes('Linux') ? 'Linux PC (Emergency)' : 'PC (Emergency)'

      const result = await emergencyAuthVerify({
        requestId: emergencyRequestId.value,
        recoveryKeyHash: recoveryKeyHashHex,
        smsCode: smsCode.value,
        deviceId,
        deviceName,
        deviceType: 'PC',
        ed25519PublicKey: pubKeyB64,
      })

      if (result.requiresNewRecoveryCode) {
        ElMessage.warning('Recovery code has been invalidated. You must generate a new recovery code.')
      }

      const encryptedKey = await encryptPrivateKey(deviceKeys.privateKeyRaw, getDek() as CryptoKey)
      memzero(deviceKeys.privateKeyRaw)

      emergencyRequestId.value = ''
      emergencyRecoverySalt.value = ''
      emergencyChallenge.value = ''
      recoveryWords.value = Array(12).fill('')
      smsCode.value = ''

      await fetchDevices()
      return true
    } catch (e: unknown) {
      authError.value = e instanceof Error ? e.message : 'Emergency authorization failed'
      return false
    } finally {
      authLoading.value = false
    }
  }

  function resetAuth() {
    authStep.value = 0
    authLevel.value = 1
    authError.value = ''
    authLoading.value = false
    authRequestId.value = ''
    authFingerprint.value = ''
    authExpiresAt.value = ''
    qrCodeData.value = ''
    totpCode.value = ''
    smsCode.value = ''
    recoveryWords.value = Array(12).fill('')
    emergencyRequestId.value = ''
    emergencyRecoverySalt.value = ''
    emergencyChallenge.value = ''
    sessionStorage.removeItem('level1_temp_priv_key_hex')
    sessionStorage.removeItem('level1_temp_pub_key_b64')
    sessionStorage.removeItem('level2_temp_priv_key_hex')
    sessionStorage.removeItem('level2_temp_pub_key_b64')
    sessionStorage.removeItem('level2_request_id')
  }

  function setRecoveryWord(index: number, word: string) {
    recoveryWords.value[index] = word
  }

  return {
    devices,
    loading,
    authLoading,
    authError,
    authStep,
    authLevel,
    authRequestId,
    authFingerprint,
    authExpiresAt,
    qrCodeData,
    totpCode,
    smsCode,
    recoveryWords,
    emergencyRequestId,
    emergencyRecoverySalt,
    emergencyChallenge,
    fetchDevices,
    revokeDevice,
    initLevel1Qr,
    completeLevel1Auth,
    initLevel2AuthFlow,
    pollForLevel2Dek,
    completeLevel2AuthFlow,
    initEmergencyAuth,
    completeEmergencyAuth,
    resetAuth,
    setRecoveryWord,
  }
})
