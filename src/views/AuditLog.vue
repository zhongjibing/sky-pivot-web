<template>
  <div class="audit-log-page">
    <div class="page-header">
      <h2>Audit Log</h2>
      <div class="filter-bar">
        <el-select v-model="severity" placeholder="Severity" clearable style="width: 140px">
          <el-option label="All" value="" />
          <el-option label="Critical" value="CRITICAL" />
          <el-option label="Warning" value="WARNING" />
          <el-option label="Info" value="INFO" />
        </el-select>
        <el-date-picker
          v-model="dateRange"
          type="daterange"
          range-separator="to"
          start-placeholder="From"
          end-placeholder="To"
          style="width: 280px"
        />
        <el-button type="primary" @click="fetchLogs">Search</el-button>
      </div>
    </div>

    <el-card class="log-card" shadow="never">
      <el-table :data="logs" style="width: 100%" v-loading="loading">
        <el-table-column prop="timestamp" label="Time" width="180">
          <template #default="{ row }">
            {{ formatDate(row.timestamp) }}
          </template>
        </el-table-column>
        <el-table-column prop="event" label="Event" min-width="200" />
        <el-table-column prop="severity" label="Severity" width="100">
          <template #default="{ row }">
            <el-tag
              :type="severityTagType(row.severity)"
              size="small"
            >
              {{ row.severity }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="ipAddress" label="IP Address" width="140" />
      </el-table>

      <div class="pagination-wrapper">
        <el-pagination
          v-model:current-page="page"
          v-model:page-size="size"
          :page-sizes="[20, 50, 100]"
          :total="total"
          layout="total, sizes, prev, pager, next"
          @change="fetchLogs"
        />
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

interface AuditLogEntry {
  id: string
  timestamp: string
  event: string
  severity: 'CRITICAL' | 'WARNING' | 'INFO'
  ipAddress: string
}

const loading = ref(false)
const severity = ref('')
const dateRange = ref<[Date, Date] | null>(null)
const page = ref(1)
const size = ref(20)
const total = ref(0)
const logs = ref<AuditLogEntry[]>([])

function severityTagType(s: string) {
  if (s === 'CRITICAL') return 'danger'
  if (s === 'WARNING') return 'warning'
  return 'info'
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleString()
}

async function fetchLogs() {
  loading.value = true
  // Audit log API — Phase 1.3.6 (backend)
  loading.value = false
}
</script>

<style scoped>
.audit-log-page {
  padding: 24px;
}
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  flex-wrap: wrap;
  gap: 12px;
}
.page-header h2 {
  font-size: 20px;
  font-weight: 600;
  color: #303133;
  margin: 0;
}
.filter-bar {
  display: flex;
  gap: 12px;
  align-items: center;
}
.log-card {
  border: 1px solid var(--border-color);
}
.pagination-wrapper {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}
</style>
