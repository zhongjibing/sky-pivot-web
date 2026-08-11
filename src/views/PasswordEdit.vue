<template>
  <div class="page-container">
    <div class="page-header">
      <h1 class="page-title">Edit Password</h1>
    </div>

    <div class="card-container" style="max-width: 680px;" v-loading="pageLoading">
      <el-form
        ref="formRef"
        :model="form"
        :rules="rules"
        label-position="top"
        @submit.prevent="handleSubmit"
      >
        <el-form-item label="Title" prop="title">
          <el-input v-model="form.title" disabled />
        </el-form-item>

        <el-form-item label="URL" prop="url">
          <el-input v-model="form.url" placeholder="https://example.com (optional)" />
        </el-form-item>

        <el-form-item label="Account" prop="account">
          <el-input v-model="form.account" placeholder="Enter account / username / email" />
        </el-form-item>

        <el-form-item label="Password" prop="password">
          <div class="password-input-row">
            <el-input
              v-model="form.password"
              type="password"
              placeholder="Enter password"
              show-password
              style="flex: 1;"
            />
            <el-button @click="generatorVisible = true">
              <el-icon><MagicStick /></el-icon>Generate
            </el-button>
          </div>
        </el-form-item>

        <div class="strength-indicator" v-if="form.password">
          <span class="strength-label">Strength:</span>
          <el-tag :type="strengthTagType" size="small">{{ strengthLevel || 'Checking...' }}</el-tag>
          <el-progress
            :percentage="strengthScore"
            :color="strengthColor"
            :stroke-width="6"
            style="flex: 1; margin-left: 12px;"
          />
        </div>

        <el-form-item label="Notes" prop="notes">
          <el-input
            v-model="form.notes"
            type="textarea"
            :rows="4"
            placeholder="Additional notes (optional)"
          />
        </el-form-item>

        <el-form-item>
          <div class="form-actions">
            <el-button @click="$router.back()">Cancel</el-button>
            <el-button type="primary" native-type="submit" :loading="loading">Save</el-button>
          </div>
        </el-form-item>
      </el-form>
    </div>

    <PasswordGenerator
      v-model="generatorVisible"
      @select="onPasswordSelected"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { usePasswordsStore } from '@/stores/passwords'
import { checkStrength } from '@/crypto/password-gen'
import { ElMessage } from 'element-plus'
import { MagicStick } from '@element-plus/icons-vue'
import PasswordGenerator from '@/components/PasswordGenerator.vue'
import type { FormInstance } from 'element-plus'

const router = useRouter()
const route = useRoute()
const passwordsStore = usePasswordsStore()
const formRef = ref<FormInstance>()
const loading = ref(false)
const pageLoading = ref(false)
const generatorVisible = ref(false)
const strengthScore = ref(0)
const strengthLevel = ref('')
const id = route.params.id as string

const form = reactive({
  title: '',
  url: '',
  account: '',
  password: '',
  notes: '',
})

const rules = {
  url: [
    {
      validator: (_rule: any, value: string, callback: any) => {
        if (value && !/^https?:\/\/.+/i.test(value)) {
          callback(new Error('Please enter a valid URL starting with http:// or https://'))
        } else {
          callback()
        }
      },
      trigger: 'blur',
    },
  ],
  account: [
    { required: true, message: 'Account is required', trigger: 'blur' },
  ],
  password: [
    { required: true, message: 'Password is required', trigger: 'blur' },
  ],
}

const strengthTagType = computed(() => {
  const level = strengthLevel.value.toLowerCase().replace(/[\s_-]/g, '')
  if (level === 'weak') return 'danger'
  if (level === 'fair') return 'warning'
  if (level === 'strong') return 'primary'
  if (level === 'verystrong') return 'success'
  return 'info'
})

const strengthColor = computed(() => {
  const level = strengthLevel.value.toLowerCase().replace(/[\s_-]/g, '')
  if (level === 'weak') return '#f56c6c'
  if (level === 'fair') return '#e6a23c'
  if (level === 'strong') return '#409eff'
  if (level === 'verystrong') return '#67c23a'
  return '#909399'
})

let strengthTimer: ReturnType<typeof setTimeout> | null = null
watch(() => form.password, (val) => {
  if (strengthTimer) clearTimeout(strengthTimer)
  if (val) {
    strengthTimer = setTimeout(() => {
      const result = checkStrength(val)
      strengthScore.value = result.score
      strengthLevel.value = result.level
    }, 300)
  }
})

onMounted(async () => {
  pageLoading.value = true
  try {
    const detail = await passwordsStore.getDetail(id)
    if (detail) {
      form.title = detail.title
      form.url = detail.url || ''
      form.account = detail.account
      form.password = detail.password
      form.notes = detail.notes || ''
    } else {
      ElMessage.error('Failed to load password detail')
      router.back()
    }
  } catch {
    ElMessage.error('Failed to load password detail')
    router.back()
  } finally {
    pageLoading.value = false
  }
})

function onPasswordSelected(password: string) {
  form.password = password
}

async function handleSubmit() {
  if (!formRef.value) return
  await formRef.value.validate(async (valid) => {
    if (!valid) return
    loading.value = true
    try {
      await passwordsStore.update(
        id,
        {
          url: form.url || undefined,
          account: form.account,
          password: form.password,
          notes: form.notes || undefined,
        },
      )
      router.push('/')
    } catch {
      ElMessage.error('Failed to update password')
    } finally {
      loading.value = false
    }
  })
}
</script>

<style scoped>
.password-input-row {
  display: flex;
  gap: 8px;
  width: 100%;
}

.strength-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 20px;
  margin-top: -12px;
}

.strength-label {
  font-size: 13px;
  color: #606266;
  white-space: nowrap;
}

.form-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  width: 100%;
}
</style>
