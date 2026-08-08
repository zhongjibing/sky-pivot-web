<template>
  <el-tag :type="tagType" size="small" effect="light" round>
    {{ label }}
  </el-tag>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  level: string
}>()

const normalizedLevel = computed(() => {
  const l = (props.level || '').toLowerCase().replace(/[\s_-]/g, '')
  return l
})

const tagType = computed(() => {
  switch (normalizedLevel.value) {
    case 'weak': return 'danger'
    case 'fair': return 'warning'
    case 'strong': return ''
    case 'verystrong': return 'success'
    default: return 'info'
  }
})

const label = computed(() => {
  switch (normalizedLevel.value) {
    case 'weak': return 'Weak'
    case 'fair': return 'Fair'
    case 'strong': return 'Strong'
    case 'verystrong': return 'Very Strong'
    default: return props.level || 'Unknown'
  }
})
</script>
