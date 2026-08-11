<template>
  <div class="page-container">
    <div class="page-header">
      <h1 class="page-title">Health Dashboard</h1>
    </div>

    <div class="health-grid" v-loading="loading">
      <!-- Summary Cards -->
      <div class="summary-cards">
        <div class="summary-card" @click="filterByLevel('weak')">
          <div class="card-icon bg-weak">
            <el-icon :size="24" color="#fff"><WarningFilled /></el-icon>
          </div>
          <div class="card-info">
            <span class="card-number">{{ summary.weak }}</span>
            <span class="card-label">Weak</span>
          </div>
        </div>
        <div class="summary-card" @click="filterByLevel('fair')">
          <div class="card-icon bg-fair">
            <el-icon :size="24" color="#fff"><InfoFilled /></el-icon>
          </div>
          <div class="card-info">
            <span class="card-number">{{ summary.fair }}</span>
            <span class="card-label">Fair</span>
          </div>
        </div>
        <div class="summary-card" @click="filterByLevel('strong')">
          <div class="card-icon bg-strong">
            <el-icon :size="24" color="#fff"><Check /></el-icon>
          </div>
          <div class="card-info">
            <span class="card-number">{{ summary.strong }}</span>
            <span class="card-label">Strong</span>
          </div>
        </div>
        <div class="summary-card" @click="filterByLevel('very_strong')">
          <div class="card-icon bg-very-strong">
            <el-icon :size="24" color="#fff"><CircleCheckFilled /></el-icon>
          </div>
          <div class="card-info">
            <span class="card-number">{{ summary.veryStrong }}</span>
            <span class="card-label">Very Strong</span>
          </div>
        </div>
      </div>

      <!-- Chart Area -->
      <div class="chart-section">
        <div class="card-container">
          <h3 class="section-title">Password Health Distribution</h3>
          <div class="chart-container" v-if="total > 0">
            <div class="pie-chart">
              <svg viewBox="0 0 100 100" class="pie-svg">
                <circle
                  v-for="(segment, index) in pieSegments"
                  :key="index"
                  cx="50"
                  cy="50"
                  r="40"
                  fill="transparent"
                  :stroke="segment.color"
                  stroke-width="20"
                  :stroke-dasharray="segment.dashArray"
                  :stroke-dashoffset="segment.dashOffset"
                  :style="{ cursor: 'pointer' }"
                  @click="filterByLevel(segment.level)"
                />
              </svg>
              <div class="pie-center">
                <span class="pie-total">{{ total }}</span>
                <span class="pie-label">Total</span>
              </div>
            </div>
            <div class="chart-legend">
              <div class="legend-item" v-for="item in legendItems" :key="item.label">
                <span class="legend-dot" :style="{ backgroundColor: item.color }" />
                <span class="legend-label">{{ item.label }}</span>
                <span class="legend-value">{{ item.value }} ({{ item.percent }}%)</span>
              </div>
            </div>
          </div>
          <el-empty v-else description="No passwords to analyze" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { usePasswordsStore } from '@/stores/passwords'
import { WarningFilled, InfoFilled, Check, CircleCheckFilled } from '@element-plus/icons-vue'

const router = useRouter()
const passwordsStore = usePasswordsStore()
const loading = ref(false)
const summary = ref({ weak: 0, fair: 0, strong: 0, veryStrong: 0 })

const total = computed(() =>
  summary.value.weak + summary.value.fair + summary.value.strong + summary.value.veryStrong
)

const pieSegments = computed(() => {
  if (total.value === 0) return []
  const circumference = 2 * Math.PI * 40
  const segments = []
  let offset = 0

  const items = [
    { level: 'weak', value: summary.value.weak, color: '#f56c6c' },
    { level: 'fair', value: summary.value.fair, color: '#e6a23c' },
    { level: 'strong', value: summary.value.strong, color: '#409eff' },
    { level: 'very_strong', value: summary.value.veryStrong, color: '#67c23a' },
  ]

  for (const item of items) {
    if (item.value > 0) {
      const percent = item.value / total.value
      const length = circumference * percent
      segments.push({
        level: item.level,
        color: item.color,
        dashArray: `${length} ${circumference - length}`,
        dashOffset: `${-offset + circumference * 0.25}`,
      })
      offset += length
    }
  }
  return segments
})

const legendItems = computed(() => {
  const t = total.value || 1
  return [
    { label: 'Weak', value: summary.value.weak, color: '#f56c6c', percent: Math.round((summary.value.weak / t) * 100) },
    { label: 'Fair', value: summary.value.fair, color: '#e6a23c', percent: Math.round((summary.value.fair / t) * 100) },
    { label: 'Strong', value: summary.value.strong, color: '#409eff', percent: Math.round((summary.value.strong / t) * 100) },
    { label: 'Very Strong', value: summary.value.veryStrong, color: '#67c23a', percent: Math.round((summary.value.veryStrong / t) * 100) },
  ]
})

onMounted(async () => {
  loading.value = true
  try {
    summary.value = await passwordsStore.getHealthSummary()
  } catch {
    // error handled by interceptor
  } finally {
    loading.value = false
  }
})

function filterByLevel(level: string) {
  router.push({ path: '/', query: { healthLevel: level } })
}
</script>

<style scoped>
.health-grid {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.summary-cards {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 20px;
}

.summary-card {
  background: #fff;
  border-radius: 12px;
  padding: 24px;
  display: flex;
  align-items: center;
  gap: 16px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.04);
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
}

.summary-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
}

.card-icon {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.card-info {
  display: flex;
  flex-direction: column;
}

.card-number {
  font-size: 28px;
  font-weight: 700;
  color: #1d1e2c;
}

.card-label {
  font-size: 14px;
  color: #909399;
}

.chart-section {
  width: 100%;
}

.section-title {
  font-size: 16px;
  font-weight: 600;
  color: #1d1e2c;
  margin-bottom: 24px;
}

.chart-container {
  display: flex;
  align-items: center;
  gap: 60px;
  justify-content: center;
  padding: 20px 0;
}

.pie-chart {
  position: relative;
  width: 220px;
  height: 220px;
}

.pie-svg {
  width: 100%;
  height: 100%;
  transform: rotate(-90deg);
}

.pie-center {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  text-align: center;
}

.pie-total {
  display: block;
  font-size: 32px;
  font-weight: 700;
  color: #1d1e2c;
}

.pie-label {
  display: block;
  font-size: 13px;
  color: #909399;
}

.chart-legend {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 10px;
}

.legend-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  flex-shrink: 0;
}

.legend-label {
  font-size: 14px;
  color: #606266;
  min-width: 90px;
}

.legend-value {
  font-size: 14px;
  color: #909399;
}
</style>
