let SECURE_BUFFER_COUNTER = 0
const SECURE_BUFFERS = new Set<WeakRef<ArrayBuffer>>()

function cleanupDeadRefs(): void {
  for (const ref of SECURE_BUFFERS) {
    if (!ref.deref()) {
      SECURE_BUFFERS.delete(ref)
    }
  }
}

export function secureMalloc(size: number): Uint8Array {
  const buf = new ArrayBuffer(size)
  SECURE_BUFFER_COUNTER++
  SECURE_BUFFERS.add(new WeakRef(buf))
  return new Uint8Array(buf)
}

export function memzero(target: Uint8Array | ArrayBuffer): void {
  const buf = target instanceof ArrayBuffer ? target : target.buffer
  const view = new Uint8Array(buf)
  crypto.getRandomValues(view)
  view.fill(0)
  SECURE_BUFFER_COUNTER = Math.max(0, SECURE_BUFFER_COUNTER - 1)
}

export function clearSecureMemory(): void {
  cleanupDeadRefs()
  for (const ref of SECURE_BUFFERS) {
    const buf = ref.deref()
    if (buf) {
      memzero(buf)
      SECURE_BUFFERS.delete(ref)
    }
  }
  SECURE_BUFFER_COUNTER = 0
}

export function isSecureBuffer(buf: ArrayBuffer): boolean {
  for (const ref of SECURE_BUFFERS) {
    if (ref.deref() === buf) return true
  }
  return false
}

export function lockPage(buffer: ArrayBuffer): void {
  // mlock not available in browser; no-op
}

export function trackedSecureBufferCount(): number {
  return SECURE_BUFFER_COUNTER
}
