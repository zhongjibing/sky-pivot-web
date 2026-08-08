<template>
  <div ref="shadowHost" class="secure-password-host"></div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch, onUnmounted } from 'vue'

const props = withDefaults(defineProps<{
  password: string
  masked?: boolean
}>(), {
  masked: true,
})

const shadowHost = ref<HTMLDivElement | null>(null)
let shadowRoot: ShadowRoot | null = null
let maskTimer: ReturnType<typeof setTimeout> | null = null

function renderToShadow() {
  if (!shadowRoot || !shadowHost.value) return
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const text = props.masked ? '\u2022'.repeat(Math.min(props.password.length, 16)) : props.password
  ctx.font = '16px monospace'
  const metrics = ctx.measureText(text)
  canvas.width = Math.ceil(metrics.width) + 16
  canvas.height = 32

  shadowRoot.innerHTML = ''
  const style = document.createElement('style')
  style.textContent = `
    :host { display: inline-block; user-select: none; }
    canvas { vertical-align: middle; }
  `
  shadowRoot.appendChild(style)

  const newCtx = canvas.getContext('2d')!
  newCtx.font = '16px monospace'
  newCtx.textBaseline = 'middle'
  newCtx.fillStyle = getComputedStyle(shadowHost.value).color || '#303133'
  newCtx.fillText(text, 8, canvas.height / 2)

  shadowRoot.appendChild(canvas)
}

function startAutoMask() {
  clearAutoMask()
  if (!props.masked) {
    maskTimer = setTimeout(() => {
      // re-render masked after 30s — consumer should set :masked="true"
    }, 30000)
  }
}

function clearAutoMask() {
  if (maskTimer) {
    clearTimeout(maskTimer)
    maskTimer = null
  }
}

onMounted(() => {
  if (shadowHost.value) {
    shadowRoot = shadowHost.value.attachShadow({ mode: 'closed' })
    renderToShadow()
    startAutoMask()
  }
})

watch(() => [props.password, props.masked], () => {
  renderToShadow()
  startAutoMask()
})

onUnmounted(() => {
  clearAutoMask()
})
</script>

<style scoped>
.secure-password-host {
  display: inline-block;
  min-width: 80px;
  min-height: 24px;
}
</style>
