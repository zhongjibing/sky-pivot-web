<template>
  <div class="recovery-code-display">
    <el-alert
      title="Save Your Recovery Code"
      type="warning"
      :closable="false"
      show-icon
    >
      <template #default>
        <p>Write down these 12 words in order and store them securely. You will need them to recover your account if you lose your master password.</p>
      </template>
    </el-alert>

    <div class="word-grid">
      <div
        v-for="(word, index) in words"
        :key="index"
        class="word-chip"
      >
        <span class="word-index">{{ String(index + 1).padStart(2, '0') }}</span>
        <span class="word-text">{{ word }}</span>
      </div>
    </div>

    <div class="actions">
      <el-button type="primary" @click="handleCopy">
        <el-icon><CopyDocument /></el-icon> Copy Words
      </el-button>
      <el-button @click="handleDownload">
        <el-icon><Download /></el-icon> Download
      </el-button>
    </div>

    <el-divider />

    <el-form ref="confirmFormRef" :model="confirmForm" class="confirm-form">
      <el-form-item
        label="Confirm by entering word {{ confirmIndex + 1 }}"
        prop="word"
        :rules="confirmRules"
      >
        <el-input v-model="confirmForm.word" placeholder="Enter the word" />
      </el-form-item>
      <el-form-item>
        <el-button
          type="success"
          :loading="confirming"
          :disabled="!confirmForm.word"
          @click="handleConfirm"
        >
          Confirm Recovery Code
        </el-button>
      </el-form-item>
    </el-form>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { CopyDocument, Download } from '@element-plus/icons-vue'

const props = withDefaults(defineProps<{
  words: string[]
}>(), {
  words: () => [],
})

const emit = defineEmits<{
  confirmed: []
}>()

const confirming = ref(false)
const confirmForm = ref({ word: '' })

const confirmIndex = computed(() => {
  return Math.floor(Math.random() * props.words.length)
})

const confirmRules = computed(() => [
  {
    required: true,
    validator: (_rule: unknown, value: string, cb: (err?: Error) => void) => {
      if (value.toLowerCase() !== props.words[confirmIndex.value]?.toLowerCase()) {
        cb(new Error('Word does not match'))
      } else {
        cb()
      }
    },
    trigger: 'blur',
  },
])

async function handleCopy() {
  await navigator.clipboard.writeText(props.words.join(' '))
  ElMessage.success('Recovery words copied')
}

function handleDownload() {
  const text = props.words.map((w, i) => `${i + 1}. ${w}`).join('\n')
  const blob = new Blob([text], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'sky-pivot-recovery.txt'
  a.click()
  URL.revokeObjectURL(url)
}

function handleConfirm() {
  confirming.value = true
  setTimeout(() => {
    confirming.value = false
    ElMessage.success('Recovery code confirmed')
    emit('confirmed')
  }, 500)
}
</script>

<style scoped>
.recovery-code-display {
  max-width: 600px;
}
.word-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  margin: 20px 0;
}
.word-chip {
  display: flex;
  align-items: center;
  gap: 8px;
  background: #f5f7fa;
  border: 1px solid #e4e7ed;
  border-radius: 6px;
  padding: 8px 12px;
  font-family: monospace;
}
.word-index {
  color: #909399;
  font-size: 12px;
  min-width: 20px;
}
.word-text {
  color: #303133;
  font-weight: 500;
}
.actions {
  display: flex;
  gap: 12px;
  margin-bottom: 8px;
}
.confirm-form {
  margin-top: 8px;
}
</style>
