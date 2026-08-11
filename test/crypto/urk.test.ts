import { describe, it, expect } from 'vitest'
import { deriveURKBits, deriveURK } from '@/crypto/urk'

const TEST_PASSWORD = 'password'
const TEST_SALT = new TextEncoder().encode('saltsaltsaltsalt')

// Shared cross-platform vector: must match the miniapp's libsodium Argon2id
// (m=16MB, t=2, p=1, dkLen=32). Verified identical output on both platforms.
const VECTOR_PASSWORD = 'SkyPivot#Test@2026'
const VECTOR_SALT = Uint8Array.from(
  Buffer.from('a1b2c3d4e5f60718293a4b5c6d7e8f90', 'hex'),
)
const VECTOR_URK_HEX = '0B07B6A62DC4CA9241EEF563C866B1C246F1D13E609787073F3DDB0A202D18E8'

describe('deriveURKBits', () => {
  it('produces deterministic 32-byte output matching the cross-platform vector', async () => {
    const bits = await deriveURKBits(VECTOR_PASSWORD, VECTOR_SALT)

    expect(bits.byteLength).toBe(32)

    const hex = Array.from(new Uint8Array(bits))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()

    expect(hex).toBe(VECTOR_URK_HEX)
  })

  it('produces identical output for same inputs', async () => {
    const a = await deriveURKBits(TEST_PASSWORD, TEST_SALT)
    const b = await deriveURKBits(TEST_PASSWORD, TEST_SALT)

    const hexA = Array.from(new Uint8Array(a))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
    const hexB = Array.from(new Uint8Array(b))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')

    expect(hexA).toBe(hexB)
  })

  it('produces different output for different passwords', async () => {
    const a = await deriveURKBits('password', TEST_SALT)
    const b = await deriveURKBits('password2', TEST_SALT)

    const hexA = Array.from(new Uint8Array(a))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
    const hexB = Array.from(new Uint8Array(b))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')

    expect(hexA).not.toBe(hexB)
  })

  it('produces different output for different salts', async () => {
    const saltA = new TextEncoder().encode('saltsaltsaltsalt')
    const saltB = new TextEncoder().encode('saltBsaltBsaltB')

    const a = await deriveURKBits(TEST_PASSWORD, saltA)
    const b = await deriveURKBits(TEST_PASSWORD, saltB)

    const hexA = Array.from(new Uint8Array(a))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
    const hexB = Array.from(new Uint8Array(b))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')

    expect(hexA).not.toBe(hexB)
  })
})

describe('deriveURK', () => {
  it('returns a non-extractable AES-GCM CryptoKey', async () => {
    const urk = await deriveURK(TEST_PASSWORD, TEST_SALT)

    expect(urk.type).toBe('secret')
    expect(urk.algorithm.name).toBe('AES-GCM')
    expect((urk.algorithm as AesKeyAlgorithm).length).toBe(256)
    expect(urk.extractable).toBe(false)
    expect(urk.usages).toContain('encrypt')
    expect(urk.usages).toContain('decrypt')
  })

  it('returns a key that can be used for AES-GCM encrypt/decrypt', async () => {
    const urk = await deriveURK(TEST_PASSWORD, TEST_SALT)
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const plaintext = new TextEncoder().encode('test plaintext')

    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      urk,
      plaintext,
    )

    expect(ciphertext.byteLength).toBeGreaterThan(0)

    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      urk,
      ciphertext,
    )

    expect(new TextDecoder().decode(decrypted)).toBe('test plaintext')
  })

  it('refuses to export the key (extractable: false)', async () => {
    const urk = await deriveURK(TEST_PASSWORD, TEST_SALT)

    await expect(
      crypto.subtle.exportKey('raw', urk),
    ).rejects.toThrow()
  })
})
