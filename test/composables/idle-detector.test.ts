import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useIdleDetector } from '@/composables/useIdleDetector'

describe('useIdleDetector', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts with isIdle = false', () => {
    const onIdle = vi.fn()
    const { isIdle, start, stop } = useIdleDetector(5000, onIdle)
    start()
    expect(isIdle.value).toBe(false)
    stop()
  })

  it('calls onIdle after timeout', () => {
    const onIdle = vi.fn()
    const { start, stop } = useIdleDetector(5000, onIdle)
    start()

    vi.advanceTimersByTime(5000)

    expect(onIdle).toHaveBeenCalledTimes(1)
    stop()
  })

  it('does not fire onIdle before timeout', () => {
    const onIdle = vi.fn()
    const { start, stop } = useIdleDetector(5000, onIdle)
    start()

    vi.advanceTimersByTime(4999)

    expect(onIdle).not.toHaveBeenCalled()
    stop()
  })

  it('resets timer on mousemove', () => {
    const onIdle = vi.fn()
    const { start, stop } = useIdleDetector(5000, onIdle)
    start()

    vi.advanceTimersByTime(4000)
    document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }))
    vi.advanceTimersByTime(4000)

    expect(onIdle).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1001)
    expect(onIdle).toHaveBeenCalledTimes(1)
    stop()
  })

  it('resets timer on keydown', () => {
    const onIdle = vi.fn()
    const { start, stop } = useIdleDetector(5000, onIdle)
    start()

    vi.advanceTimersByTime(4000)
    document.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true }))
    vi.advanceTimersByTime(4000)

    expect(onIdle).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1001)
    expect(onIdle).toHaveBeenCalledTimes(1)
    stop()
  })

  it('resets timer on mousedown', () => {
    const onIdle = vi.fn()
    const { start, stop } = useIdleDetector(5000, onIdle)
    start()

    vi.advanceTimersByTime(4000)
    document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    vi.advanceTimersByTime(4000)

    expect(onIdle).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1001)
    expect(onIdle).toHaveBeenCalledTimes(1)
    stop()
  })

  it('resets timer on touchstart', () => {
    const onIdle = vi.fn()
    const { start, stop } = useIdleDetector(5000, onIdle)
    start()

    vi.advanceTimersByTime(4000)
    document.dispatchEvent(new TouchEvent('touchstart', { bubbles: true }))
    vi.advanceTimersByTime(4000)

    expect(onIdle).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1001)
    expect(onIdle).toHaveBeenCalledTimes(1)
    stop()
  })

  it('resets timer on scroll', () => {
    const onIdle = vi.fn()
    const { start, stop } = useIdleDetector(5000, onIdle)
    start()

    vi.advanceTimersByTime(4000)
    document.dispatchEvent(new Event('scroll', { bubbles: true }))
    vi.advanceTimersByTime(4000)

    expect(onIdle).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1001)
    expect(onIdle).toHaveBeenCalledTimes(1)
    stop()
  })

  it('resets timer on wheel', () => {
    const onIdle = vi.fn()
    const { start, stop } = useIdleDetector(5000, onIdle)
    start()

    vi.advanceTimersByTime(4000)
    document.dispatchEvent(new WheelEvent('wheel', { bubbles: true }))
    vi.advanceTimersByTime(4000)

    expect(onIdle).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1001)
    expect(onIdle).toHaveBeenCalledTimes(1)
    stop()
  })

  it('stop prevents onIdle from firing', () => {
    const onIdle = vi.fn()
    const { start, stop } = useIdleDetector(5000, onIdle)
    start()

    vi.advanceTimersByTime(3000)
    stop()
    vi.advanceTimersByTime(5000)

    expect(onIdle).not.toHaveBeenCalled()
  })

  it('isIdle ref reflects idle state', () => {
    const onIdle = vi.fn()
    const { isIdle, start, stop } = useIdleDetector(5000, onIdle)
    start()

    expect(isIdle.value).toBe(false)
    vi.advanceTimersByTime(5000)
    expect(isIdle.value).toBe(true)
    stop()
  })

  it('reset clears idle state', () => {
    const onIdle = vi.fn()
    const { isIdle, start, stop, reset } = useIdleDetector(5000, onIdle)
    start()

    vi.advanceTimersByTime(5000)
    expect(isIdle.value).toBe(true)
    reset()
    expect(isIdle.value).toBe(false)
    stop()
  })

  it('does not re-fire onIdle after being idle', () => {
    const onIdle = vi.fn()
    const { start, stop } = useIdleDetector(5000, onIdle)
    start()

    vi.advanceTimersByTime(5000)
    expect(onIdle).toHaveBeenCalledTimes(1)

    // Activity resets idle state and timer
    document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }))
    vi.advanceTimersByTime(5000)
    expect(onIdle).toHaveBeenCalledTimes(2)
    stop()
  })
})
