<template>
  <el-dialog
    v-model="visible"
    title="Verify Master Password"
    width="420px"
    :close-on-click-modal="false"
    @close="handleClose"
  >
    <p class="dialog-desc">{{ description || 'Please enter your master password to continue.' }}</p>
    <el-form @submit.prevent="handleConfirm">
      <el-form-item>
        <el-input
          v-model="masterPassword"
          type="password"
          placeholder="Enter master password"
          show-password
          :disabled="loading"
          @keyup.enter="handleConfirm"
        />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="handleClose" :disabled="loading">Cancel</el-button>
      <el-button type="primary" @click="handleConfirm" :loading="loading" :disabled="!masterPassword">
        Confirm
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { ElMessage } from 'element-plus'

const props = defineProps<{
  modelValue: boolean
  description?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'confirmed': [masterPassword: string]
}>()

const authStore = useAuthStore()
const visible = ref(false)
const masterPassword = ref('')
const loading = ref(false)

watch(() => props.modelValue, (val) => {
  visible.value = val
  if (val) {
    masterPassword.value = ''
  }
})

watch(visible, (val) => {
  emit('update:modelValue', val)
})

async function handleConfirm() {
  if (!masterPassword.value) return
  loading.value = true
  try {
    const success = await authStore.verifyMasterPwd(masterPassword.value)
    if (success) {
      emit('confirmed', masterPassword.value)
      visible.value = false
    } else {
      ElMessage.error('Invalid master password')
    }
  } catch {
    ElMessage.error('Verification failed')
  } finally {
    loading.value = false
  }
}

function handleClose() {
  visible.value = false
}
</script>

<style scoped>
.dialog-desc {
  color: #606266;
  font-size: 14px;
  margin-bottom: 16px;
}
</style>
