<template>
  <div class="layout">
    <aside class="sidebar">
      <div class="sidebar-logo">
        <el-icon :size="28" color="#409eff"><Lock /></el-icon>
        <span class="logo-text">Password Manager</span>
      </div>
      <el-menu
        :default-active="activeMenu"
        class="sidebar-menu"
        background-color="#1d1e2c"
        text-color="#a3a6b4"
        active-text-color="#409eff"
        router
      >
        <el-menu-item index="/">
          <el-icon><Key /></el-icon>
          <span>Passwords</span>
        </el-menu-item>
        <el-menu-item index="/trash">
          <el-icon><Delete /></el-icon>
          <span>Trash</span>
        </el-menu-item>
        <el-menu-item index="/health">
          <el-icon><DataAnalysis /></el-icon>
          <span>Health Dashboard</span>
        </el-menu-item>
        <el-menu-item index="/devices">
          <el-icon><Monitor /></el-icon>
          <span>Devices</span>
        </el-menu-item>
        <el-menu-item index="/audit-log">
          <el-icon><List /></el-icon>
          <span>Audit Log</span>
        </el-menu-item>
        <el-menu-item index="/settings">
          <el-icon><Setting /></el-icon>
          <span>Settings</span>
        </el-menu-item>
      </el-menu>
    </aside>
    <div class="main-area">
      <header class="topbar">
        <div class="topbar-left"></div>
        <div class="topbar-right">
          <el-dropdown trigger="click" @command="handleCommand">
            <span class="user-info">
              <el-avatar :size="32" class="user-avatar">
                <el-icon><User /></el-icon>
              </el-avatar>
              <span class="user-name">User</span>
              <el-icon><ArrowDown /></el-icon>
            </span>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="about">
                  <el-icon><InfoFilled /></el-icon>About
                </el-dropdown-item>
                <el-dropdown-item command="logout" divided>
                  <el-icon><SwitchButton /></el-icon>Logout
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </header>
      <main class="content">
        <router-view />
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useSyncStore } from '@/stores/sync'
import {
  Lock, Key, Delete, DataAnalysis, Setting, Monitor, List,
  User, ArrowDown, InfoFilled, SwitchButton,
} from '@element-plus/icons-vue'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const syncStore = useSyncStore()

const activeMenu = computed(() => {
  const path = route.path
  if (path === '/' || path.startsWith('/create') || path.startsWith('/edit')) return '/'
  return path
})

syncStore.startPolling()

function handleCommand(command: string) {
  if (command === 'logout') {
    syncStore.stopPolling()
    authStore.logout()
  } else if (command === 'about') {
    router.push('/about')
  }
}
</script>

<style scoped>
.layout {
  display: flex;
  height: 100vh;
  min-width: 1366px;
}

.sidebar {
  width: var(--sidebar-width);
  background-color: var(--sidebar-bg);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}

.sidebar-logo {
  height: 60px;
  display: flex;
  align-items: center;
  padding: 0 20px;
  gap: 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.logo-text {
  font-size: 16px;
  font-weight: 600;
  color: #fff;
  white-space: nowrap;
}

.sidebar-menu {
  border-right: none;
  flex: 1;
  padding-top: 12px;
}

.sidebar-menu .el-menu-item {
  height: 48px;
  line-height: 48px;
  margin: 4px 8px;
  border-radius: 6px;
}

.sidebar-menu .el-menu-item:hover {
  background-color: rgba(255, 255, 255, 0.06) !important;
}

.sidebar-menu .el-menu-item.is-active {
  background-color: rgba(64, 158, 255, 0.15) !important;
}

.main-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.topbar {
  height: var(--topbar-height);
  background: #fff;
  border-bottom: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  flex-shrink: 0;
}

.topbar-right {
  display: flex;
  align-items: center;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  color: #606266;
}

.user-avatar {
  background-color: #409eff;
}

.user-name {
  font-size: 14px;
}

.content {
  flex: 1;
  overflow: auto;
  background-color: var(--bg-color);
}
</style>
