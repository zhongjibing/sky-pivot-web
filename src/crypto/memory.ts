const SECURE_BUFFERS = new WeakSet<ArrayBuffer>()

export function secureMalloc(size: number): Uint8Array {
  const buf = new ArrayBuffer(size)
  SECURE_BUFFERS.add(buf)
  return new Uint8Array(buf)
}

export function memzero(target: Uint8Array | ArrayBuffer): void {
  const buf = target instanceof ArrayBuffer ? target : target.buffer
  const view = new Uint8Array(buf)
  crypto.getRandomValues(view)
  view.fill(0)
}

export function clearSecureMemory(): void {
  // placeholder — will iterate SECURE_BUFFERS and zero all
}

export function isSecureBuffer(buf: ArrayBuffer): boolean {
  return SECURE_BUFFERS.has(buf)
}

export function lockPage(buffer: ArrayBuffer): void {
  // mlock not available in browser; no-op
}
