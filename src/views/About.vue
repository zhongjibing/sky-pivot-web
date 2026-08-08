<template>
  <div class="page-container">
    <div class="page-header">
      <h1 class="page-title">About</h1>
    </div>

    <div class="card-container about-card">
      <div class="about-header">
        <div class="app-logo">
          <el-icon :size="48" color="#409eff"><Lock /></el-icon>
        </div>
        <h2 class="app-name">Password Manager</h2>
        <span class="app-version">V1.0.0</span>
      </div>

      <div class="about-section">
        <h3 class="about-section-title">Tech Stack</h3>
        <div class="tech-list">
          <el-tag effect="plain" size="default">Vue 3.5+</el-tag>
          <el-tag effect="plain" size="default">TypeScript</el-tag>
          <el-tag effect="plain" size="default">Vite 5.x</el-tag>
          <el-tag effect="plain" size="default">Element Plus</el-tag>
          <el-tag effect="plain" size="default">Pinia</el-tag>
          <el-tag effect="plain" size="default">Vue Router 4</el-tag>
          <el-tag effect="plain" size="default">Axios</el-tag>
        </div>
      </div>

      <div class="about-section">
        <h3 class="about-section-title">Links</h3>
        <div class="links-list">
          <a href="#" class="about-link" @click.prevent>
            <el-icon><Document /></el-icon>
            <span>Privacy Policy</span>
          </a>
          <a href="#" class="about-link" @click.prevent>
            <el-icon><Document /></el-icon>
            <span>User Agreement</span>
          </a>
        </div>
      </div>

      <div class="about-section">
        <h3 class="about-section-title">Contact</h3>
        <p class="contact-email">
          <el-icon><Message /></el-icon>
          support@passwordmanager.com
        </p>
      </div>

      <div class="about-footer">
        <p>&copy; {{ currentYear }} Password Manager. All rights reserved.</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Lock, Document, Message } from '@element-plus/icons-vue'

const currentYear = computed(() => new Date().getFullYear())
</script>

<style scoped>
.about-card {
  max-width: 600px;
  padding: 40px;
}

.about-header {
  text-align: center;
  margin-bottom: 40px;
}

.app-logo {
  margin-bottom: 16px;
}

.app-name {
  font-size: 24px;
  font-weight: 600;
  color: #1d1e2c;
  margin-bottom: 4px;
}

.app-version {
  font-size: 14px;
  color: #909399;
  background: #f5f7fa;
  padding: 2px 12px;
  border-radius: 12px;
}

.about-section {
  margin-bottom: 32px;
}

.about-section-title {
  font-size: 16px;
  font-weight: 600;
  color: #1d1e2c;
  margin-bottom: 12px;
}

.tech-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.links-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.about-link {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: #409eff;
  text-decoration: none;
}

.about-link:hover {
  text-decoration: underline;
}

.contact-email {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: #606266;
}

.about-footer {
  text-align: center;
  padding-top: 24px;
  border-top: 1px solid #e4e7ed;
}

.about-footer p {
  font-size: 13px;
  color: #909399;
}
</style>
