<template>
  <div class="devices-page">
    <div class="page-header">
      <h2>Trusted Devices</h2>
      <el-button type="primary" @click="showAddDialog = true">
        <el-icon><Plus /></el-icon> Authorize New Device
      </el-button>
    </div>

    <el-card class="devices-card" shadow="never">
      <el-table :data="store.devices" style="width: 100%" v-loading="store.loading">
        <el-table-column prop="deviceName" label="Device" min-width="200">
          <template #default="scope">
            <div class="device-info">
              <el-icon :size="20" :color="scope.row.revoked ? '#c0c4cc' : '#303133'">
                <component :is="deviceIcon(scope.row.deviceType)" />
              </el-icon>
              <div class="device-meta">
                <span class="device-name">{{ scope.row.deviceName }}</span>
                <span class="device-id">{{ scope.row.deviceId }}</span>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="deviceType" label="Type" width="100">
          <template #default="scope">
            <el-tag :type="scope.row.deviceType === 'PC' ? 'info' : 'success'" size="small">
              {{ scope.row.deviceType === 'PC' ? 'PC' : scope.row.deviceType === 'MINIAPP' ? 'MiniApp' : scope.row.deviceType }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="lastSeen" label="Last Seen" width="180">
          <template #default="scope">
            {{ formatDate(scope.row.lastSeen) }}
          </template>
        </el-table-column>
        <el-table-column label="Status" width="150">
          <template #default="scope">
            <el-tag
              :type="scope.row.revoked ? 'danger' : scope.row.authorized ? 'success' : 'warning'"
              size="small"
            >
              {{ scope.row.revoked ? 'Revoked' : scope.row.authorized ? 'Active' : 'Pending' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="Actions" width="120" fixed="right">
          <template #default="scope">
            <el-popconfirm
              v-if="!scope.row.revoked"
              title="Revoke this device? It will be signed out immediately."
              confirm-button-text="Revoke"
              confirm-button-type="danger"
              @confirm="handleRevoke(scope.row)"
            >
              <template #reference>
                <el-button type="danger" link>Revoke</el-button>
              </template>
            </el-popconfirm>
            <span v-else class="revoked-label">—</span>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!store.loading && store.devices.length === 0" description="No devices registered" />
    </el-card>

    <DeviceAuthDialog
      v-model:visible="showAddDialog"
      @authorized="onDeviceAuthorized"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Plus, Monitor, Iphone } from '@element-plus/icons-vue'
import DeviceAuthDialog from '@/components/DeviceAuthDialog.vue'
import { useDevicesStore, type TrustedDevice } from '@/stores/devices'

const store = useDevicesStore()
const showAddDialog = ref(false)

function deviceIcon(deviceType: string) {
  return deviceType === 'MINIAPP' ? Iphone : Monitor
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleString()
}

async function handleRevoke(device: TrustedDevice | any) {
  try {
    await store.revokeDevice(device.deviceId)
  } catch {
    // error already handled in store
  }
}

function onDeviceAuthorized() {
  showAddDialog.value = false
  store.fetchDevices()
}

onMounted(() => {
  store.fetchDevices()
})
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
  gap: 10px;
}
.device-meta {
  display: flex;
  flex-direction: column;
}
.device-name {
  font-weight: 500;
  font-size: 14px;
}
.device-id {
  font-size: 11px;
  color: #909399;
  font-family: 'Courier New', monospace;
}
.revoked-label {
  color: #c0c4cc;
  font-size: 13px;
}
</style>