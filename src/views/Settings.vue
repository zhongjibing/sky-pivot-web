<template>
  <div class="page-container">
    <div class="page-header">
      <h1 class="page-title">Settings</h1>
    </div>

    <div class="settings-sections">
      <!-- Change Master Password -->
      <div class="card-container settings-card">
        <h3 class="section-title">Change Master Password</h3>
        <p class="section-desc">Changing your master password will re-encrypt all your data with the new password.</p>

        <el-form
          ref="changePwdFormRef"
          :model="changePwdForm"
          :rules="changePwdRules"
          label-position="top"
          style="max-width: 480px;"
        >
          <el-form-item label="Current Master Password" prop="currentPassword">
            <el-input
              v-model="changePwdForm.currentPassword"
              type="password"
              placeholder="Enter current master password"
              show-password
            />
          </el-form-item>

          <el-form-item label="New Master Password" prop="newPassword">
            <el-input
              v-model="changePwdForm.newPassword"
              type="password"
              placeholder="Enter new master password"
              show-password
            />
          </el-form-item>

          <div class="strength-bar" v-if="changePwdForm.newPassword">
            <div class="strength-track">
              <div
                class="strength-fill"
                :style="{ width: strengthPercent + '%', backgroundColor: strengthColor }"
              />
            </div>
            <span class="strength-text" :style="{ color: strengthColor }">{{ strengthLabel }}</span>
          </div>

          <el-form-item label="Confirm New Master Password" prop="confirmPassword">
            <el-input
              v-model="changePwdForm.confirmPassword"
              type="password"
              placeholder="Confirm new master password"
              show-password
            />
          </el-form-item>

          <el-form-item>
            <el-button type="primary" @click="handleChangePassword" :loading="changePwdLoading">
              Change Master Password
            </el-button>
          </el-form-item>
        </el-form>
      </div>

      <!-- Delete Account -->
      <div class="card-container settings-card danger-card">
        <h3 class="section-title danger-title">Delete Account</h3>
        <p class="section-desc">Permanently delete your account and all associated data. This action cannot be undone.</p>

        <el-button type="danger" @click="openDeleteAccount">Delete My Account</el-button>
      </div>

      <!-- About -->
      <div class="card-container settings-card">
        <h3 class="section-title">About</h3>
        <p class="section-desc">View application information and version.</p>
        <el-button @click="$router.push('/about')">About Password Manager</el-button>
      </div>
    </div>

    <!-- Delete Account Dialog -->
    <el-dialog v-model="deleteDialogVisible" title="Delete Account" width="520px" :close-on-click-modal="false">
      <div v-if="!deletePreview" v-loading="previewLoading" style="min-height: 100px;" />
      <div v-else>
        <div class="delete-preview">
          <p class="delete-warning">This will permanently delete:</p>
          <ul>
            <li>{{ deletePreview.totalPasswords }} passwords</li>
            <li>{{ deletePreview.trashedPasswords }} trashed passwords</li>
            <li>{{ deletePreview.loginHistoryRecords }} login history records</li>
          </ul>
        </div>

        <el-checkbox v-model="deleteConfirmed" class="delete-confirm-checkbox">
          I understand that this action is irreversible and all my data will be permanently lost.
        </el-checkbox>
      </div>

      <template #footer>
        <el-button @click="deleteDialogVisible = false">Cancel</el-button>
        <el-button type="danger" @click="proceedDeleteAccount" :disabled="!deleteConfirmed" :loading="deleteLoading">
          Delete Account
        </el-button>
      </template>
    </el-dialog>

    <!-- Master Password Dialog for delete account -->
    <MasterPasswordDialog
      v-model="masterPwdVisible"
      description="Please enter your master password to confirm account deletion."
      @confirmed="onMasterPasswordConfirmed"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { changeMasterPassword } from '@/api/auth'
import { checkStrength } from '@/api/utils'
import { getDeletePreview, deleteAccount } from '@/api/account'
import { useAuthStore } from '@/stores/auth'
import { useCryptoStore } from '@/stores/crypto'
import { useSyncStore } from '@/stores/sync'
import { clearAllDatabases } from '@/db/indexeddb'
import { ElMessage } from 'element-plus'
import MasterPasswordDialog from '@/components/MasterPasswordDialog.vue'
import type { FormInstance } from 'element-plus'

const router = useRouter()
const authStore = useAuthStore()
const cryptoStore = useCryptoStore()
const syncStore = useSyncStore()

// Change Password
const changePwdFormRef = ref<FormInstance>()
const changePwdLoading = ref(false)
const strengthScore = ref(0)
const strengthLevel = ref('')

const changePwdForm = reactive({
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
})

const changePwdRules = {
  currentPassword: [
    { required: true, message: 'Please enter current master password', trigger: 'blur' },
  ],
  newPassword: [
    { required: true, message: 'Please enter new master password', trigger: 'blur' },
    { min: 10, message: 'Password must be at least 10 characters', trigger: 'blur' },
  ],
  confirmPassword: [
    { required: true, message: 'Please confirm new master password', trigger: 'blur' },
    {
      validator: (_rule: any, value: string, callback: any) => {
        if (value !== changePwdForm.newPassword) {
          callback(new Error('Passwords do not match'))
        } else {
          callback()
        }
      },
      trigger: 'blur',
    },
  ],
}

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
watch(() => changePwdForm.newPassword, (val) => {
  if (strengthTimer) clearTimeout(strengthTimer)
  if (val) {
    strengthTimer = setTimeout(async () => {
      try {
        const res = await checkStrength(val)
        strengthScore.value = res.data.score
        strengthLevel.value = res.data.level
      } catch {
        // silent
      }
    }, 300)
  }
})

async function handleChangePassword() {
  if (!changePwdFormRef.value) return
  await changePwdFormRef.value.validate(async (valid) => {
    if (!valid) return
    changePwdLoading.value = true
    try {
      await changeMasterPassword(changePwdForm.currentPassword, changePwdForm.newPassword)
      ElMessage.success('Master password changed successfully')
      changePwdForm.currentPassword = ''
      changePwdForm.newPassword = ''
      changePwdForm.confirmPassword = ''
    } catch {
      // error handled by interceptor
    } finally {
      changePwdLoading.value = false
    }
  })
}

// Delete Account
const deleteDialogVisible = ref(false)
const deletePreview = ref<DeletePreview | null>(null)
const previewLoading = ref(false)
const deleteConfirmed = ref(false)
const deleteLoading = ref(false)
const masterPwdVisible = ref(false)

async function openDeleteAccount() {
  deleteDialogVisible.value = true
  deleteConfirmed.value = false
  deletePreview.value = null
  previewLoading.value = true
  try {
    const res = await getDeletePreview()
    deletePreview.value = res.data
  } catch {
    // error handled by interceptor
  } finally {
    previewLoading.value = false
  }
}

function proceedDeleteAccount() {
  masterPwdVisible.value = true
}

async function onMasterPasswordConfirmed(_masterPassword: string) {
  deleteLoading.value = true
  try {
    await deleteAccount()
    ElMessage.success('Account deleted successfully')
    deleteDialogVisible.value = false
    syncStore.stopPolling()
    cryptoStore.destroy()
    await clearAllDatabases()
    localStorage.clear()
    sessionStorage.clear()
    authStore.logout()
  } catch {
    // error handled by interceptor
  } finally {
    deleteLoading.value = false
  }
}
</script>

<style scoped>
.settings-sections {
  display: flex;
  flex-direction: column;
  gap: 24px;
  max-width: 720px;
}

.settings-card {
  padding: 28px;
}

.section-title {
  font-size: 18px;
  font-weight: 600;
  color: #1d1e2c;
  margin-bottom: 8px;
}

.danger-title {
  color: #f56c6c;
}

.section-desc {
  font-size: 14px;
  color: #909399;
  margin-bottom: 20px;
}

.strength-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
  margin-top: -8px;
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

.danger-card {
  border-left: 4px solid #f56c6c;
}

.delete-preview {
  background: #fef0f0;
  border: 1px solid #fde2e2;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 20px;
}

.delete-warning {
  font-size: 14px;
  color: #f56c6c;
  font-weight: 500;
  margin-bottom: 8px;
}

.delete-preview ul {
  padding-left: 20px;
}

.delete-preview li {
  font-size: 14px;
  color: #606266;
  line-height: 1.8;
}

.delete-confirm-checkbox {
  margin-top: 8px;
}
</style>
