<template>
  <el-dialog
    v-model="visible"
    title="Password Generator"
    width="500px"
    :close-on-click-modal="false"
    @close="handleClose"
  >
    <div class="generator-content">
      <div class="generated-password">
        <el-input
          v-model="generatedPassword"
          readonly
          size="large"
          class="password-display"
        >
          <template #append>
            <el-button @click="handleGenerate" :loading="generating">
              <el-icon><Refresh /></el-icon>
            </el-button>
          </template>
        </el-input>
      </div>

      <div class="strength-indicator" v-if="generatedPassword">
        <span class="strength-label">Strength:</span>
        <el-tag :type="strengthTagType" size="small">{{ strengthLevel || 'Checking...' }}</el-tag>
        <el-progress
          :percentage="strengthScore"
          :color="strengthColor"
          :stroke-width="6"
          style="flex: 1; margin-left: 12px;"
        />
      </div>

      <div class="generator-options">
        <div class="option-row">
          <span class="option-label">Length: {{ length }}</span>
          <el-slider v-model="length" :min="8" :max="64" :step="1" show-stops style="flex: 1;" />
        </div>

        <div class="option-toggles">
          <el-checkbox v-model="uppercase">Uppercase (A-Z)</el-checkbox>
          <el-checkbox v-model="lowercase">Lowercase (a-z)</el-checkbox>
          <el-checkbox v-model="digits">Digits (0-9)</el-checkbox>
          <el-checkbox v-model="special">Special (!@#$)</el-checkbox>
        </div>
      </div>
    </div>

    <template #footer>
      <el-button @click="handleClose">Cancel</el-button>
      <el-button @click="handleGenerate" :loading="generating">Regenerate</el-button>
      <el-button type="primary" @click="handleUse" :disabled="!generatedPassword">
        Use this password
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { generatePassword, checkStrength } from '@/api/utils'
import { ElMessage } from 'element-plus'
import { Refresh } from '@element-plus/icons-vue'

const props = defineProps<{
  modelValue: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'select': [password: string]
}>()

const visible = ref(false)
const generatedPassword = ref('')
const generating = ref(false)
const length = ref(16)
const uppercase = ref(true)
const lowercase = ref(true)
const digits = ref(true)
const special = ref(true)
const strengthScore = ref(0)
const strengthLevel = ref('')

const strengthTagType = computed(() => {
  const level = strengthLevel.value.toLowerCase()
  if (level === 'weak') return 'danger'
  if (level === 'fair') return 'warning'
  if (level === 'strong') return ''
  if (level === 'very_strong' || level === 'verystrong' || level === 'very strong') return 'success'
  return 'info'
})

const strengthColor = computed(() => {
  const level = strengthLevel.value.toLowerCase()
  if (level === 'weak') return '#f56c6c'
  if (level === 'fair') return '#e6a23c'
  if (level === 'strong') return '#409eff'
  if (level === 'very_strong' || level === 'verystrong' || level === 'very strong') return '#67c23a'
  return '#909399'
})

watch(() => props.modelValue, (val) => {
  visible.value = val
  if (val) {
    handleGenerate()
  }
})

watch(visible, (val) => {
  emit('update:modelValue', val)
})

watch(generatedPassword, async (val) => {
  if (val) {
    try {
      const res = await checkStrength(val)
      strengthScore.value = res.data.score
      strengthLevel.value = res.data.level
    } catch {
      // silent
    }
  }
})

async function handleGenerate() {
  if (!uppercase.value && !lowercase.value && !digits.value && !special.value) {
    ElMessage.warning('At least one character type must be selected')
    return
  }
  generating.value = true
  try {
    const res = await generatePassword({
      length: length.value,
      uppercase: uppercase.value,
      lowercase: lowercase.value,
      digits: digits.value,
      special: special.value,
    })
    generatedPassword.value = res.data.password
  } catch {
    ElMessage.error('Failed to generate password')
  } finally {
    generating.value = false
  }
}

function handleUse() {
  if (generatedPassword.value) {
    emit('select', generatedPassword.value)
    visible.value = false
  }
}

function handleClose() {
  visible.value = false
}
</script>

<style scoped>
.generator-content {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.generated-password {
  width: 100%;
}

.password-display :deep(.el-input__inner) {
  font-family: 'Courier New', monospace;
  font-size: 16px;
  letter-spacing: 1px;
}

.strength-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
}

.strength-label {
  font-size: 13px;
  color: #606266;
  white-space: nowrap;
}

.generator-options {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.option-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.option-label {
  font-size: 14px;
  color: #606266;
  white-space: nowrap;
  min-width: 90px;
}

.option-toggles {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
</style>
