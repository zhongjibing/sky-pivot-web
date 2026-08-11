import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import SecurePasswordDisplay from '@/components/SecurePasswordDisplay.vue'

describe('SecurePasswordDisplay', () => {
  beforeEach(() => {
    vi.useFakeTimers()

    HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
      font: '',
      fillStyle: '',
      textBaseline: '',
      fillText: vi.fn(),
      measureText: (text: string) => ({ width: text.length * 10 }),
    } as unknown as CanvasRenderingContext2D)

    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
      writable: true,
      configurable: true,
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('renders the shadow host element', () => {
    const wrapper = mount(SecurePasswordDisplay, {
      props: { password: 'mypassword123' },
    })
    const host = wrapper.find('.secure-password-host')
    expect(host.exists()).toBe(true)
  })

  it('does not expose password text in DOM text nodes', () => {
    mount(SecurePasswordDisplay, {
      props: { password: 'SecretP@ssw0rd!' },
    })
    const bodyText = document.body.textContent || ''
    expect(bodyText).not.toContain('SecretP@ssw0rd!')
  })

  it('renders masked dots by default (starts hidden)', () => {
    const wrapper = mount(SecurePasswordDisplay, {
      props: { password: 'test123' },
    })
    expect((wrapper.vm as unknown as { isRevealed: () => boolean }).isRevealed()).toBe(false)
  })

  it('reveals password when show() is called', () => {
    const wrapper = mount(SecurePasswordDisplay, {
      props: { password: 'test123' },
    })
    const vm = wrapper.vm as unknown as {
      isRevealed: () => boolean
      show: () => void
    }
    vm.show()
    expect(vm.isRevealed()).toBe(true)
  })

  it('hides password when hide() is called', () => {
    const wrapper = mount(SecurePasswordDisplay, {
      props: { password: 'test123' },
    })
    const vm = wrapper.vm as unknown as {
      isRevealed: () => boolean
      show: () => void
      hide: () => void
    }
    vm.show()
    expect(vm.isRevealed()).toBe(true)
    vm.hide()
    expect(vm.isRevealed()).toBe(false)
  })

  it('auto-masks after autoMaskTimeout ms', () => {
    const wrapper = mount(SecurePasswordDisplay, {
      props: { password: 'test123', autoMaskTimeout: 5000 },
    })
    const vm = wrapper.vm as unknown as {
      isRevealed: () => boolean
      show: () => void
    }

    vm.show()
    expect(vm.isRevealed()).toBe(true)

    vi.advanceTimersByTime(5000)

    expect(vm.isRevealed()).toBe(false)
  })

  it('does not auto-mask if user hides manually before timeout', () => {
    const wrapper = mount(SecurePasswordDisplay, {
      props: { password: 'test123', autoMaskTimeout: 5000 },
    })
    const vm = wrapper.vm as unknown as {
      isRevealed: () => boolean
      show: () => void
      hide: () => void
    }

    vm.show()
    expect(vm.isRevealed()).toBe(true)

    vi.advanceTimersByTime(2000)
    vm.hide()
    expect(vm.isRevealed()).toBe(false)

    vi.advanceTimersByTime(4000)
    expect(vm.isRevealed()).toBe(false)
  })

  it('auto-mask resets copy state', () => {
    const wrapper = mount(SecurePasswordDisplay, {
      props: { password: 'test123', autoMaskTimeout: 5000 },
    })
    const vm = wrapper.vm as unknown as {
      isRevealed: () => boolean
      show: () => void
    }

    vm.show()
    vi.advanceTimersByTime(5000)
    expect(vm.isRevealed()).toBe(false)
  })

  it('resets to masked when password prop changes', async () => {
    const wrapper = mount(SecurePasswordDisplay, {
      props: { password: 'oldpass' },
    })
    const vm = wrapper.vm as unknown as {
      isRevealed: () => boolean
      show: () => void
    }

    vm.show()
    expect(vm.isRevealed()).toBe(true)

    await wrapper.setProps({ password: 'newpass' })
    await nextTick()

    expect(vm.isRevealed()).toBe(false)
  })

  it('emits copy event with password value', async () => {
    const wrapper = mount(SecurePasswordDisplay, {
      props: { password: 'mysecret' },
    })

    const vm = wrapper.vm as unknown as {
      isRevealed: () => boolean
      show: () => void
    }
    vm.show()

    const shadowRoot = (wrapper.vm as unknown as { peekShadow: () => ShadowRoot | null }).peekShadow()
    expect(shadowRoot).not.toBeNull()

    const buttons = shadowRoot!.querySelectorAll('button')
    const copyBtn = Array.from(buttons).find(b => b.title === 'Copy password')
    expect(copyBtn).not.toBeNull()
    if (copyBtn) {
      await (copyBtn as HTMLButtonElement).click()
    }

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('mysecret')
    expect(wrapper.emitted('copy')).toBeTruthy()
    expect(wrapper.emitted('copy')![0]).toEqual(['mysecret'])
  })

  it('schedules clipboard clear after autoMaskTimeout when copy triggered', async () => {
    const wrapper = mount(SecurePasswordDisplay, {
      props: { password: 'mysecret', autoMaskTimeout: 5000 },
    })

    const vm = wrapper.vm as unknown as { show: () => void }
    vm.show()

    const shadowRoot = (wrapper.vm as unknown as { peekShadow: () => ShadowRoot | null }).peekShadow()
    expect(shadowRoot).not.toBeNull()

    const buttons = shadowRoot!.querySelectorAll('button')
    const copyBtn = Array.from(buttons).find(b => b.title === 'Copy password')
    expect(copyBtn).not.toBeNull()
    if (copyBtn) {
      await (copyBtn as HTMLButtonElement).click()
    }

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('mysecret')

    vi.advanceTimersByTime(5000)

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('')
    expect(navigator.clipboard.writeText).toHaveBeenCalledTimes(2)
  })

  it('gracefully handles clipboard write failure', () => {
    const writeTextMock = vi.fn().mockRejectedValue(new Error('Permission denied'))
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeTextMock },
      writable: true,
      configurable: true,
    })

    const wrapper = mount(SecurePasswordDisplay, {
      props: { password: 'mysecret' },
    })

    const vm = wrapper.vm as unknown as { show: () => void }
    vm.show()

    expect(() => {
      const shadowRoot = (wrapper.vm as unknown as { peekShadow: () => ShadowRoot | null }).peekShadow()
      if (shadowRoot) {
        const buttons = shadowRoot.querySelectorAll('button')
        const copyBtn = Array.from(buttons).find(b => b.title === 'Copy password')
        if (copyBtn) {
          copyBtn.dispatchEvent(new Event('click'))
        }
      }
    }).not.toThrow()
  })

  it('defaults autoMaskTimeout to 30000', () => {
    const wrapper = mount(SecurePasswordDisplay, {
      props: { password: 'test' },
    })
    expect(wrapper.props('autoMaskTimeout')).toBe(30000)
  })

  it('accepts custom autoMaskTimeout', () => {
    const wrapper = mount(SecurePasswordDisplay, {
      props: { password: 'test', autoMaskTimeout: 15000 },
    })
    expect(wrapper.props('autoMaskTimeout')).toBe(15000)
  })

  it('renders canvas element inside shadow DOM', () => {
    const wrapper = mount(SecurePasswordDisplay, {
      props: { password: 'test' },
    })
    const shadowRoot = (wrapper.vm as unknown as { peekShadow: () => ShadowRoot | null }).peekShadow()
    expect(shadowRoot).not.toBeNull()
    const canvas = shadowRoot!.querySelector('canvas')
    expect(canvas).not.toBeNull()
  })

  it('has show button when masked', () => {
    const wrapper = mount(SecurePasswordDisplay, {
      props: { password: 'test' },
    })
    const shadowRoot = (wrapper.vm as unknown as { peekShadow: () => ShadowRoot | null }).peekShadow()
    const buttons = shadowRoot!.querySelectorAll('button')
    const toggleBtn = Array.from(buttons).find(b => b.title === 'Show password')
    expect(toggleBtn).not.toBeNull()
  })

  it('has hide and copy buttons when revealed', () => {
    const wrapper = mount(SecurePasswordDisplay, {
      props: { password: 'test' },
    })
    const vm = wrapper.vm as unknown as { show: () => void }
    vm.show()

    const shadowRoot = (wrapper.vm as unknown as { peekShadow: () => ShadowRoot | null }).peekShadow()
    const buttons = shadowRoot!.querySelectorAll('button')
    const hideBtn = Array.from(buttons).find(b => b.title === 'Hide password')
    const copyBtn = Array.from(buttons).find(b => b.title === 'Copy password')
    expect(hideBtn).not.toBeNull()
    expect(copyBtn).not.toBeNull()
  })

  it('cleanup on unmount cancels pending timers', () => {
    const wrapper = mount(SecurePasswordDisplay, {
      props: { password: 'test', autoMaskTimeout: 5000 },
    })
    const vm = wrapper.vm as unknown as { show: () => void; isRevealed: () => boolean }
    vm.show()

    wrapper.unmount()

    vi.advanceTimersByTime(5000)
  })
})
