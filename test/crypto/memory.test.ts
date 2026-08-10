import { describe, it, expect } from 'vitest'
import {
  secureMalloc,
  memzero,
  clearSecureMemory,
  isSecureBuffer,
  lockPage,
  trackedSecureBufferCount,
} from '@/crypto/memory'

describe('memzero', () => {
  it('zeroes a Uint8Array after random fill', () => {
    const arr = new Uint8Array([1, 2, 3, 4, 5])
    memzero(arr)
    expect([...arr]).toEqual([0, 0, 0, 0, 0])
  })

  it('zeroes an ArrayBuffer', () => {
    const buf = new ArrayBuffer(8)
    const view = new Uint8Array(buf)
    view.fill(0xff)
    memzero(buf)
    const after = new Uint8Array(buf)
    expect([...after]).toEqual([0, 0, 0, 0, 0, 0, 0, 0])
  })
})

describe('secureMalloc', () => {
  it('allocates a buffer of specified size', () => {
    const buf = secureMalloc(16)
    expect(buf.byteLength).toBe(16)
    expect(buf instanceof Uint8Array).toBe(true)
  })

  it('tracks allocated buffers', () => {
    const countBefore = trackedSecureBufferCount()
    secureMalloc(32)
    expect(trackedSecureBufferCount()).toBeGreaterThanOrEqual(countBefore + 1)
  })
})

describe('isSecureBuffer', () => {
  it('returns true for secureMalloc-allocated buffer', () => {
    const buf = secureMalloc(8)
    expect(isSecureBuffer(buf.buffer)).toBe(true)
  })

  it('returns false for non-tracked buffer', () => {
    const buf = new ArrayBuffer(8)
    expect(isSecureBuffer(buf)).toBe(false)
  })
})

describe('clearSecureMemory', () => {
  it('zeroes all tracked secure buffers', () => {
    const a = secureMalloc(8)
    const b = secureMalloc(16)
    a.fill(0x42)
    b.fill(0x99)

    clearSecureMemory()

    expect([...new Uint8Array(a.buffer)]).toEqual([0, 0, 0, 0, 0, 0, 0, 0])
    expect([...new Uint8Array(b.buffer)]).toEqual(new Array(16).fill(0))
  })

  it('resets counter after clearing', () => {
    secureMalloc(8)
    secureMalloc(16)
    clearSecureMemory()
    expect(trackedSecureBufferCount()).toBe(0)
  })

  it('handles buffers that have been GCd', () => {
    // Allocate and release without keeping reference
    secureMalloc(8)
    // Force WeakRef to potentially be collected
    clearSecureMemory()
    expect(trackedSecureBufferCount()).toBe(0)
  })
})

describe('lockPage', () => {
  it('is a no-op in browser environment', () => {
    const buf = new ArrayBuffer(4)
    expect(() => lockPage(buf)).not.toThrow()
  })
})
