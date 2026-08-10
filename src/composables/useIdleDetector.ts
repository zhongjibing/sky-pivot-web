import { ref, onUnmounted } from 'vue'

const IDLE_EVENTS = [
  'mousemove',
  'keydown',
  'mousedown',
  'touchstart',
  'scroll',
  'wheel',
] as const

export function useIdleDetector(timeoutMs: number, onIdle: () => void) {
  const isIdle = ref(false)
  let timer: ReturnType<typeof setTimeout> | null = null

  function resetTimer(): void {
    if (timer) {
      clearTimeout(timer)
    }
    if (isIdle.value) {
      isIdle.value = false
    }
    timer = setTimeout(() => {
      isIdle.value = true
      onIdle()
    }, timeoutMs)
  }

  function start(): void {
    stop()
    for (const event of IDLE_EVENTS) {
      document.addEventListener(event, resetTimer, { passive: true })
    }
    resetTimer()
  }

  function stop(): void {
    for (const event of IDLE_EVENTS) {
      document.removeEventListener(event, resetTimer)
    }
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    isIdle.value = false
  }

  onUnmounted(() => {
    stop()
  })

  return {
    isIdle,
    start,
    stop,
    reset: resetTimer,
  }
}
