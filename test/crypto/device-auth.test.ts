import { describe, it, expect } from 'vitest'
import {
  generateTempX25519KeyPair,
  computeFingerprint,
  ecdhEncryptDEK,
  ecdhDecryptDEK,
  ecdhEncryptForResponse,
  ecdhDecryptFromResponse,
  bytesToHex,
  hexToBytes,
} from '@/crypto/device'

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

describe('bytesToHex / hexToBytes', () => {
  it('roundtrip preserves data', () => {
    const original = new Uint8Array([0x00, 0xff, 0xab, 0x12, 0x7e, 0x01])
    const hex = bytesToHex(original)
    expect(hex).toBe('00ffab127e01')
    const result = hexToBytes(hex)
    expect(result).toEqual(original)
  })

  it('odd-length hex throws', () => {
    expect(() => hexToBytes('abc')).toThrow()
  })

  it('empty roundtrip works', () => {
    expect(hexToBytes(bytesToHex(new Uint8Array(0)))).toEqual(new Uint8Array(0))
  })
})

describe('generateTempX25519KeyPair', () => {
  it('generates a valid X25519 keypair with 32-byte public key', async () => {
    const pair = await generateTempX25519KeyPair()
    expect(pair.publicKey).toBeInstanceOf(Uint8Array)
    expect(pair.publicKey.length).toBe(32)
    expect(pair.privateKey.type).toBe('private')
    expect(pair.privateKey.algorithm.name).toBe('X25519')
  })

  it('two calls produce different keypairs', async () => {
    const pair1 = await generateTempX25519KeyPair()
    const pair2 = await generateTempX25519KeyPair()
    expect(pair1.publicKey).not.toEqual(pair2.publicKey)
  })
})

describe('computeFingerprint', () => {
  it('produces 8 hex characters from public key base64', async () => {
    const pair = await generateTempX25519KeyPair()
    const pubKeyB64 = bytesToBase64(pair.publicKey)
    const fp = await computeFingerprint(pubKeyB64)
    expect(fp).toHaveLength(8)
    expect(/^[0-9a-f]{8}$/.test(fp)).toBe(true)
  })

  it('same input produces same fingerprint', async () => {
    const input = 'test-public-key-data'
    const fp1 = await computeFingerprint(input)
    const fp2 = await computeFingerprint(input)
    expect(fp1).toBe(fp2)
  })

  it('different inputs produce different fingerprints', async () => {
    const fp1 = await computeFingerprint('key-a')
    const fp2 = await computeFingerprint('key-b')
    expect(fp1).not.toBe(fp2)
  })
})

describe('ECDH shared secret derivation', () => {
  it('shared secrets match for both sides', async () => {
    const alice = await generateTempX25519KeyPair()
    const bob = await generateTempX25519KeyPair()

    const bobPubKey = await crypto.subtle.importKey(
      'raw', bob.publicKey, { name: 'X25519' }, true, [],
    )
    const alicePubKey = await crypto.subtle.importKey(
      'raw', alice.publicKey, { name: 'X25519' }, true, [],
    )

    const aliceShared = new Uint8Array(await crypto.subtle.deriveBits(
      { name: 'X25519', public: bobPubKey },
      alice.privateKey,
      256,
    ))

    const bobShared = new Uint8Array(await crypto.subtle.deriveBits(
      { name: 'X25519', public: alicePubKey },
      bob.privateKey,
      256,
    ))

    expect(aliceShared).toEqual(bobShared)
  })
})

describe('ecdhEncryptDEK / ecdhDecryptDEK', () => {
  it('roundtrip: encrypt then decrypt restores original DEK', async () => {
    const alice = await generateTempX25519KeyPair()
    const bob = await generateTempX25519KeyPair()

    const originalDek = crypto.getRandomValues(new Uint8Array(32))

    const { encryptedDek, senderPublicKey, iv } = await ecdhEncryptDEK(
      originalDek,
      bob.publicKey,
      alice.publicKey,
      alice.privateKey,
    )

    expect(encryptedDek).toBeTruthy()
    expect(senderPublicKey).toBeTruthy()
    expect(iv).toBeTruthy()

    const decrypted = await ecdhDecryptDEK(
      encryptedDek,
      senderPublicKey,
      iv,
      bob.privateKey,
    )

    expect(decrypted).toEqual(originalDek)
  })

  it('different peer key cannot decrypt', async () => {
    const alice = await generateTempX25519KeyPair()
    const bob = await generateTempX25519KeyPair()
    const mallory = await generateTempX25519KeyPair()

    const originalDek = crypto.getRandomValues(new Uint8Array(32))

    const { encryptedDek, senderPublicKey, iv } = await ecdhEncryptDEK(
      originalDek,
      bob.publicKey,
      alice.publicKey,
      alice.privateKey,
    )

    await expect(
      ecdhDecryptDEK(encryptedDek, senderPublicKey, iv, mallory.privateKey),
    ).rejects.toThrow()
  })
})

describe('ecdhEncryptForResponse / ecdhDecryptFromResponse', () => {
  it('roundtrip with hex-encoded payload', async () => {
    const alice = await generateTempX25519KeyPair()
    const bob = await generateTempX25519KeyPair()

    const plaintext = crypto.getRandomValues(new Uint8Array(32))

    const { ciphertext, iv } = await ecdhEncryptForResponse(
      plaintext,
      bob.publicKey,
      alice.privateKey,
    )

    const decrypted = await ecdhDecryptFromResponse(
      ciphertext,
      iv,
      alice.publicKey,
      bob.privateKey,
    )

    expect(decrypted).toEqual(plaintext)
  })

  it('wrong receiver cannot decrypt', async () => {
    const alice = await generateTempX25519KeyPair()
    const bob = await generateTempX25519KeyPair()
    const eve = await generateTempX25519KeyPair()

    const plaintext = crypto.getRandomValues(new Uint8Array(32))

    const { ciphertext, iv } = await ecdhEncryptForResponse(
      plaintext,
      bob.publicKey,
      alice.privateKey,
    )

    await expect(
      ecdhDecryptFromResponse(ciphertext, iv, alice.publicKey, eve.privateKey),
    ).rejects.toThrow()
  })
})
