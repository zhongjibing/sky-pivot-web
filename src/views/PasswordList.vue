<template>
  <div class="page-container">
    <div class="page-header">
      <h1 class="page-title">Passwords</h1>
      <el-button type="primary" @click="$router.push('/create')">
        <el-icon><Plus /></el-icon>Create
      </el-button>
    </div>

    <div class="card-container">
      <div class="toolbar">
        <el-input
          v-model="searchInput"
          placeholder="Search by title, account, or URL..."
          clearable
          style="width: 320px;"
          @input="handleSearch"
          @clear="handleSearch"
        >
          <template #prefix>
            <el-icon><Search /></el-icon>
          </template>
        </el-input>
        <el-select v-model="sortValue" style="width: 200px;" @change="handleSort">
          <el-option label="Updated (Newest)" value="updated_at-desc" />
          <el-option label="Updated (Oldest)" value="updated_at-asc" />
          <el-option label="Title (A-Z)" value="title-asc" />
          <el-option label="Title (Z-A)" value="title-desc" />
          <el-option label="Created (Newest)" value="created_at-desc" />
          <el-option label="Created (Oldest)" value="created_at-asc" />
        </el-select>
      </div>

      <el-table
        :data="passwordsStore.list"
        v-loading="passwordsStore.loading"
        style="width: 100%;"
        @row-click="handleRowClick"
        row-class-name="clickable-row"
      >
        <el-table-column label="" width="50">
          <template #default="{ row }">
            <div class="favicon-cell">
              <img
                v-if="row.url"
                :src="`https://www.google.com/s2/favicons?domain=${extractDomain(row.url)}&sz=32`"
                class="favicon"
                @error="($event.target as HTMLImageElement).style.display = 'none'"
              />
              <el-icon v-else color="#909399"><Key /></el-icon>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="title" label="Title" min-width="160" show-overflow-tooltip />
        <el-table-column prop="account" label="Account" min-width="140" show-overflow-tooltip />
        <el-table-column prop="url" label="URL" min-width="180" show-overflow-tooltip>
          <template #default="{ row }">
            <a v-if="row.url" :href="row.url" target="_blank" class="url-link" @click.stop>{{ row.url }}</a>
            <span v-else class="text-muted">-</span>
          </template>
        </el-table-column>
        <el-table-column label="Password" width="120">
          <template #default>
            <span class="password-mask">********</span>
          </template>
        </el-table-column>
        <el-table-column label="Health" width="120">
          <template #default="{ row }">
            <HealthBadge :level="row.healthLevel" />
          </template>
        </el-table-column>
        <el-table-column label="Updated" width="170">
          <template #default="{ row }">
            <span class="text-muted">{{ formatDate(row.updatedAt) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="Actions" width="160" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click.stop="openDetail(row)">View</el-button>
            <el-button link type="primary" size="small" @click.stop="goEdit(row.id)">Edit</el-button>
            <el-button link type="danger" size="small" @click.stop="handleDelete(row)">Delete</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="pagination-wrapper">
        <el-pagination
          v-model:current-page="currentPage"
          :page-size="passwordsStore.size"
          :total="passwordsStore.total"
          layout="total, prev, pager, next"
          @current-change="handlePageChange"
        />
      </div>
    </div>

    <!-- Detail Dialog -->
    <el-dialog
      v-model="detailVisible"
      title="Password Detail"
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
            <span class="detail-value password-font">{{ showPassword ? detailData.password : '********' }}</span>
            <el-button link type="primary" @click="copyPassword" v-if="showPassword">
              <el-icon><CopyDocument /></el-icon>Copy
            </el-button>
          </div>
        </div>
        <div class="detail-row">
          <span class="detail-label">Notes</span>
          <span class="detail-value">{{ detailData.notes || '-' }}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Health</span>
          <HealthBadge :level="detailData.healthLevel" />
        </div>
      </div>
    </el-dialog>

    <!-- Master Password Dialog for viewing detail -->
    <MasterPasswordDialog
      v-model="masterPwdVisible"
      @confirmed="onMasterPasswordConfirmed"
    />

    <!-- Delete Confirmation -->
    <el-dialog v-model="deleteVisible" title="Delete Password" width="400px">
      <p>Are you sure you want to delete <strong>{{ deleteTarget?.title }}</strong>? It will be moved to trash.</p>
      <template #footer>
        <el-button @click="deleteVisible = false">Cancel</el-button>
        <el-button type="danger" @click="confirmDelete" :loading="deleteLoading">Delete</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { usePasswordsStore } from '@/stores/passwords'
import { getPasswordDetail } from '@/api/passwords'
import { ElMessage } from 'element-plus'
import { Plus, Search, Key, CopyDocument } from '@element-plus/icons-vue'
import HealthBadge from '@/components/HealthBadge.vue'
import MasterPasswordDialog from '@/components/MasterPasswordDialog.vue'

const router = useRouter()
const passwordsStore = usePasswordsStore()

const searchInput = ref('')
const sortValue = ref('updated_at-desc')
const currentPage = ref(1)

const detailVisible = ref(false)
const detailData = ref<PasswordDetail | null>(null)
const showPassword = ref(false)
let passwordTimer: ReturnType<typeof setTimeout> | null = null

const masterPwdVisible = ref(false)
let pendingAction: ((masterPassword: string) => void) | null = null

const deleteVisible = ref(false)
const deleteTarget = ref<PasswordItem | null>(null)
const deleteLoading = ref(false)

let searchTimer: ReturnType<typeof setTimeout> | null = null

onMounted(() => {
  passwordsStore.fetchList()
})

function handleSearch() {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    passwordsStore.setSearch(searchInput.value)
    currentPage.value = 1
  }, 400)
}

function handleSort(val: string) {
  const [sortBy, order] = val.split('-')
  passwordsStore.setSort(sortBy, order)
}

function handlePageChange(page: number) {
  passwordsStore.setPage(page - 1)
}

function handleRowClick(row: PasswordItem) {
  openDetail(row)
}

function openDetail(_row: PasswordItem) {
  masterPwdVisible.value = true
  pendingAction = (masterPassword: string) => {
    fetchDetail(_row.id, masterPassword)
  }
}

async function onMasterPasswordConfirmed(masterPassword: string) {
  if (pendingAction) {
    pendingAction(masterPassword)
    pendingAction = null
  }
}

async function fetchDetail(id: string, masterPassword: string) {
  try {
    const res = await getPasswordDetail(id, masterPassword)
    detailData.value = res.data
    showPassword.value = true
    detailVisible.value = true

    if (passwordTimer) clearTimeout(passwordTimer)
    passwordTimer = setTimeout(() => {
      showPassword.value = false
    }, 30000)
  } catch {
    ElMessage.error('Failed to load detail')
  }
}

function clearDetail() {
  showPassword.value = false
  detailData.value = null
  if (passwordTimer) {
    clearTimeout(passwordTimer)
    passwordTimer = null
  }
}

async function copyPassword() {
  if (detailData.value) {
    try {
      await navigator.clipboard.writeText(detailData.value.password)
      ElMessage.success('Password copied, keep it safe')
    } catch {
      ElMessage.error('Failed to copy')
    }
  }
}

function goEdit(id: string) {
  router.push(`/edit/${id}`)
}

function handleDelete(row: PasswordItem) {
  deleteTarget.value = row
  deleteVisible.value = true
}

async function confirmDelete() {
  if (!deleteTarget.value) return
  deleteLoading.value = true
  try {
    await passwordsStore.remove(deleteTarget.value.id)
    deleteVisible.value = false
  } catch {
    // error handled in store
  } finally {
    deleteLoading.value = false
  }
}

function extractDomain(url: string): string {
  try {
    const u = new URL(url)
    return u.hostname
  } catch {
    return ''
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
.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  gap: 16px;
}

.favicon-cell {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.favicon {
  width: 20px;
  height: 20px;
  border-radius: 4px;
}

.clickable-row {
  cursor: pointer;
}

.url-link {
  color: #409eff;
  text-decoration: none;
}

.url-link:hover {
  text-decoration: underline;
}

.password-mask {
  color: #909399;
  letter-spacing: 2px;
  font-family: monospace;
}

.text-muted {
  color: #909399;
}

.pagination-wrapper {
  display: flex;
  justify-content: flex-end;
  margin-top: 20px;
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
