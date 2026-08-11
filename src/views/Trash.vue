<template>
  <div class="page-container">
    <div class="page-header">
      <h1 class="page-title">Trash</h1>
    </div>

    <div class="card-container">
      <div v-if="loading" v-loading="true" style="min-height: 200px;" />

      <div v-else-if="trashList.length === 0" class="empty-state">
        <el-empty description="Trash is empty">
          <template #image>
            <el-icon :size="80" color="#dcdfe6"><Delete /></el-icon>
          </template>
        </el-empty>
      </div>

      <el-table v-else :data="trashList" style="width: 100%;">
        <el-table-column prop="title" label="Title" min-width="160" show-overflow-tooltip />
        <el-table-column prop="account" label="Account" min-width="140" show-overflow-tooltip />
        <el-table-column label="Deleted" width="170">
          <template #default="{ row }">
            <span class="text-muted">{{ formatDate(row.deletedAt) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="Days Remaining" width="140">
          <template #default="{ row }">
            <el-tag :type="row.daysRemaining <= 3 ? 'danger' : 'warning'" size="small">
              {{ row.daysRemaining }} days
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="Actions" width="240" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click="openDetail(row)">View</el-button>
            <el-button link type="success" size="small" @click="handleRestore(row)" :loading="row._restoring">Restore</el-button>
            <el-button link type="danger" size="small" @click="handlePermanentDelete(row)">Delete Forever</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- Detail Dialog -->
    <el-dialog
      v-model="detailVisible"
      title="Trash Detail"
      width="560px"
      :close-on-click-modal="false"
      @close="clearDetail"
    >
      <div v-if="detailData" class="detail-content">
        <div class="detail-row">
          <span class="detail-label">Title</span>
          <span class="detail-value">{{ detailData.title }}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">URL</span>
          <span class="detail-value">
            <a v-if="detailData.url" :href="detailData.url" target="_blank">{{ detailData.url }}</a>
            <span v-else class="text-muted">-</span>
          </span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Account</span>
          <span class="detail-value">{{ detailData.account }}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Password</span>
          <div class="detail-password">
            <SecurePasswordDisplay
              v-if="detailData?.password"
              :password="detailData.password"
              :auto-mask-timeout="30000"
              @copy="onPasswordCopied"
            />
          </div>
        </div>
        <div class="detail-row">
          <span class="detail-label">Notes</span>
          <span class="detail-value">{{ detailData.notes || '-' }}</span>
        </div>
      </div>
    </el-dialog>

    <!-- Permanent Delete Confirmation -->
    <el-dialog v-model="permDeleteVisible" title="Delete Permanently" width="420px">
      <p>This action cannot be undone. The password <strong>{{ permDeleteTarget?.title }}</strong> will be permanently deleted.</p>
      <template #footer>
        <el-button @click="permDeleteVisible = false">Cancel</el-button>
        <el-button type="danger" @click="confirmPermanentDelete" :loading="permDeleteLoading">Delete Forever</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { usePasswordsStore } from '@/stores/passwords'
import { ElMessage } from 'element-plus'
import { Delete } from '@element-plus/icons-vue'
import SecurePasswordDisplay from '@/components/SecurePasswordDisplay.vue'

interface TrashItemWithFlag extends TrashItem {
  _restoring?: boolean
}

const passwordsStore = usePasswordsStore()

const loading = ref(false)
const trashList = ref<TrashItemWithFlag[]>([])

const detailVisible = ref(false)
const detailData = ref<PasswordDetail | null>(null)

const permDeleteVisible = ref(false)
const permDeleteTarget = ref<TrashItem | null>(null)
const permDeleteLoading = ref(false)

onMounted(() => {
  fetchTrash()
})

async function fetchTrash() {
  loading.value = true
  try {
    trashList.value = await passwordsStore.fetchTrash()
  } catch {
    trashList.value = []
  } finally {
    loading.value = false
  }
}

function openDetail(row: TrashItem) {
  fetchDetail(row.id)
}

async function fetchDetail(id: string) {
  try {
    const detail = await passwordsStore.getDetail(id)
    if (detail) {
      detailData.value = detail
      detailVisible.value = true
    }
  } catch {
    ElMessage.error('Failed to load detail')
  }
}

function clearDetail() {
  detailData.value = null
}

function onPasswordCopied(_password: string) {
  ElMessage.success('Password copied, clipboard will be cleared in 30 seconds')
}

async function handleRestore(row: TrashItemWithFlag) {
  row._restoring = true
  try {
    await passwordsStore.restore(row.id)
    ElMessage.success('Password restored successfully')
    fetchTrash()
  } catch {
    // error handled by interceptor
  } finally {
    row._restoring = false
  }
}

function handlePermanentDelete(row: TrashItem) {
  permDeleteTarget.value = row
  permDeleteVisible.value = true
}

async function confirmPermanentDelete() {
  if (!permDeleteTarget.value) return
  permDeleteLoading.value = true
  try {
    await passwordsStore.permanentDelete(permDeleteTarget.value.id)
    ElMessage.success('Password permanently deleted')
    permDeleteVisible.value = false
    fetchTrash()
  } catch {
    // error handled by interceptor
  } finally {
    permDeleteLoading.value = false
  }
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '-'
  try {
    const d = new Date(dateStr)
    return d.toLocaleString('zh-CN', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    })
  } catch {
    return dateStr
  }
}
</script>

<style scoped>
.empty-state {
  padding: 60px 0;
}

.text-muted {
  color: #909399;
}

.detail-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.detail-row {
  display: flex;
  align-items: flex-start;
}

.detail-label {
  width: 80px;
  font-size: 14px;
  color: #909399;
  flex-shrink: 0;
}

.detail-value {
  flex: 1;
  font-size: 14px;
  color: #303133;
  word-break: break-all;
}

.detail-password {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 12px;
}

.password-font {
  font-family: 'Courier New', monospace;
  letter-spacing: 1px;
}
</style>
