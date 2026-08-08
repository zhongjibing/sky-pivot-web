<template>
  <div class="devices-page">
    <div class="page-header">
      <h2>Trusted Devices</h2>
      <el-button type="primary" @click="showAddDialog = true">
        <el-icon><Plus /></el-icon> Add Device
      </el-button>
    </div>

    <el-card class="devices-card" shadow="never">
      <el-table :data="devices" style="width: 100%" v-loading="loading">
        <el-table-column prop="deviceName" label="Device" min-width="200">
          <template #default="{ row }">
            <div class="device-info">
              <el-icon :size="20"><Monitor /></el-icon>
              <span class="device-name">{{ row.deviceName }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="platform" label="Platform" width="120" />
        <el-table-column prop="lastSeen" label="Last Seen" width="180">
          <template #default="{ row }">
            {{ formatDate(row.lastSeen) }}
          </template>
        </el-table-column>
        <el-table-column prop="authorized" label="Status" width="120">
          <template #default="{ row }">
            <el-tag :type="row.authorized ? 'success' : 'warning'" size="small">
              {{ row.authorized ? 'Authorized' : 'Pending' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="Actions" width="120" fixed="right">
          <template #default="{ row }">
            <el-button type="danger" link @click="handleRevoke(row)">
              Revoke
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <DeviceAuthDialog v-model:visible="showAddDialog" @authorized="onDeviceAuthorized" />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Monitor } from '@element-plus/icons-vue'
import DeviceAuthDialog from '@/components/DeviceAuthDialog.vue'

interface Device {
  id: string
  deviceName: string
  platform: string
  lastSeen: string
  authorized: boolean
}

const loading = ref(false)
const showAddDialog = ref(false)
const devices = ref<Device[]>([])

function formatDate(dateStr: string): string {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleString()
}

function handleRevoke(device: Device) {
  ElMessageBox.confirm(
    `Revoke access for device "${device.deviceName}"?`,
    'Revoke Device',
    { confirmButtonText: 'Revoke', type: 'warning' },
  ).then(() => {
    ElMessage.success('Device revoked')
  })
}

function onDeviceAuthorized() {
  showAddDialog.value = false
}
</script>

<style scoped>
.devices-page {
  padding: 24px;
}
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}
.page-header h2 {
  font-size: 20px;
  font-weight: 600;
  color: #303133;
  margin: 0;
}
.devices-card {
  border: 1px solid var(--border-color);
}
.device-info {
  display: flex;
  align-items: center;
  gap: 8px;
}
.device-name {
  font-weight: 500;
}
</style>
