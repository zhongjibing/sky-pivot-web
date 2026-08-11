<template>
  <div ref="shadowHost" class="secure-password-host"></div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch, onUnmounted } from 'vue'

const props = withDefaults(defineProps<{
  password: string
  autoMaskTimeout?: number
}>(), {
  autoMaskTimeout: 30000,
})

const emit = defineEmits<{
  copy: [password: string]
}>()

const shadowHost = ref<HTMLDivElement | null>(null)
let shadowRoot: ShadowRoot | null = null
const revealed = ref(false)
const copied = ref(false)
let maskTimer: ReturnType<typeof setTimeout> | null = null
let clipboardTimer: ReturnType<typeof setTimeout> | null = null
let copyFeedbackTimer: ReturnType<typeof setTimeout> | null = null

const SVG_SHOW = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`
const SVG_HIDE = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`
const SVG_COPY = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`
const SVG_CHECK = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#67c23a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`

function clearTimers(): void {
  if (maskTimer) {
    clearTimeout(maskTimer)
    maskTimer = null
  }
  if (clipboardTimer) {
    clearTimeout(clipboardTimer)
    clipboardTimer = null
  }
  if (copyFeedbackTimer) {
    clearTimeout(copyFeedbackTimer)
    copyFeedbackTimer = null
  }
}

function renderCanvas(text: string): HTMLCanvasElement | null {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  const font = '16px "Courier New", monospace'
  ctx.font = font
  const metrics = ctx.measureText(text)
  canvas.width = Math.max(Math.ceil(metrics.width) + 16, 60)
  canvas.height = 28

  const drawCtx = canvas.getContext('2d')!
  drawCtx.font = font
  drawCtx.textBaseline = 'middle'
  drawCtx.fillStyle = '#303133'
  drawCtx.fillText(text, 8, canvas.height / 2)

  return canvas
}

function createButton(innerHTML: string, title: string, onClick: (e: Event) => void): HTMLButtonElement {
  const btn = document.createElement('button')
  btn.innerHTML = innerHTML
  btn.title = title
  btn.setAttribute('type', 'button')
  btn.style.cssText = `
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: 1px solid #dcdfe6;
    border-radius: 4px;
    cursor: pointer;
    padding: 2px 6px;
    color: #606266;
    font-size: 12px;
    line-height: 1;
    transition: all 0.2s;
  `
  btn.addEventListener('mouseenter', () => { btn.style.color = '#409eff'; btn.style.borderColor = '#409eff' })
  btn.addEventListener('mouseleave', () => { btn.style.color = '#606266'; btn.style.borderColor = '#dcdfe6' })
  btn.addEventListener('click', onClick)
  return btn
}

function updateShadowContent(): void {
  if (!shadowRoot) return

  shadowRoot.innerHTML = ''

  const style = document.createElement('style')
  style.textContent = `
    :host {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      user-select: none;
    }
    .password-area {
      display: inline-flex;
      align-items: center;
      gap: 8px;
    }
    canvas {
      vertical-align: middle;
    }
  `
  shadowRoot.appendChild(style)

  const area = document.createElement('span')
  area.className = 'password-area'

  const displayText = revealed.value ? props.password : '\u2022'.repeat(Math.min(props.password.length, 16))
  const canvas = renderCanvas(displayText)
  if (canvas) {
    area.appendChild(canvas)
  }

  const toggleBtn = createButton(
    revealed.value ? SVG_HIDE : SVG_SHOW,
    revealed.value ? 'Hide password' : 'Show password',
    (e: Event) => {
      e.preventDefault()
      toggleReveal()
    }
  )
  area.appendChild(toggleBtn)

  if (revealed.value) {
    const copyBtn = createButton(
      copied.value ? SVG_CHECK : SVG_COPY,
      copied.value ? 'Copied!' : 'Copy password',
      async (e: Event) => {
        e.preventDefault()
        await handleCopy()
      }
    )
    area.appendChild(copyBtn)
  }

  shadowRoot.appendChild(area)
}

function toggleReveal(): void {
  revealed.value = !revealed.value
  copied.value = false

  if (revealed.value) {
    startAutoMask()
  } else {
    clearAutoMask()
  }

  updateShadowContent()
}

function startAutoMask(): void {
  clearAutoMask()
  maskTimer = setTimeout(() => {
    if (revealed.value) {
      revealed.value = false
      copied.value = false
      updateShadowContent()
    }
  }, props.autoMaskTimeout)
}

function clearAutoMask(): void {
  if (maskTimer) {
    clearTimeout(maskTimer)
    maskTimer = null
  }
}

function scheduleClipboardClear(): void {
  if (clipboardTimer) {
    clearTimeout(clipboardTimer)
  }
  clipboardTimer = setTimeout(async () => {
    try {
      await navigator.clipboard.writeText('')
    } catch {
      /* clipboard clear not supported in all browsers */
    }
    clipboardTimer = null
  }, props.autoMaskTimeout)
}

async function handleCopy(): Promise<void> {
  try {
    await navigator.clipboard.writeText(props.password)
    copied.value = true
    emit('copy', props.password)
    scheduleClipboardClear()

    if (copyFeedbackTimer) clearTimeout(copyFeedbackTimer)
    copyFeedbackTimer = setTimeout(() => {
      if (revealed.value) {
        copied.value = false
        updateShadowContent()
      }
    }, 2000)

    updateShadowContent()
  } catch {
    /* clipboard write failed */
  }
}

onMounted(() => {
  if (shadowHost.value) {
    shadowRoot = shadowHost.value.attachShadow({ mode: 'closed' })
    updateShadowContent()
  }
})

watch(() => props.password, () => {
  revealed.value = false
  copied.value = false
  clearTimers()
  updateShadowContent()
})

onUnmounted(() => {
  clearTimers()
})

defineExpose({
  isRevealed: () => revealed.value,
  show: () => { revealed.value = true; startAutoMask(); updateShadowContent() },
  hide: () => { revealed.value = false; clearAutoMask(); copied.value = false; updateShadowContent() },
  peekHost: () => shadowHost.value,
  peekShadow: () => shadowRoot,
})
</script>

<style scoped>
.secure-password-host {
  display: inline-block;
  min-width: 120px;
  min-height: 28px;
}
</style>
