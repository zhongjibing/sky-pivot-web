import { describe, it, expect } from 'vitest'
import {
  generateDeviceKeyPair,
  generateStorableKeyPair,
  exportPublicKey,
  importPublicKey,
  encryptPrivateKey,
  decryptPrivateKey,
  importPrivateKey,
} from '@/crypto/device'

async function createTestURK(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new Uint8Array(32).fill(0x42),
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

describe('generateDeviceKeyPair', () => {
  it('creates a DeviceKeyPair with public key (32B) and private CryptoKey', async () => {
    const pair = await generateDeviceKeyPair()
    expect(pair.publicKey).toBeInstanceOf(Uint8Array)
    expect(pair.publicKey.length).toBe(32)
    expect(pair.privateKey.type).toBe('private')
    expect(pair.privateKey.algorithm.name).toBe('Ed25519')
  })

  it('private key is non-extractable — export throws', async () => {
    const pair = await generateDeviceKeyPair()
    await expect(crypto.subtle.exportKey('raw', pair.privateKey)).rejects.toThrow()
  })

  it('public key is extractable and roundtrips correctly', async () => {
    const pair = await generateDeviceKeyPair()
    const pubKey = await importPublicKey(pair.publicKey)
    const reexported = await exportPublicKey(pubKey)
    expect(reexported).toEqual(pair.publicKey)
  })

  it('two calls produce different key pairs', async () => {
    const pair1 = await generateDeviceKeyPair()
    const pair2 = await generateDeviceKeyPair()
    expect(pair1.publicKey).not.toEqual(pair2.publicKey)
  })

  it('signing with private key produces valid Ed25519 signature', async () => {
    const pair = await generateDeviceKeyPair()
    const message = new TextEncoder().encode('hello world')
    const signature = new Uint8Array(await crypto.subtle.sign('Ed25519', pair.privateKey, message))
    expect(signature.length).toBe(64)

    const pubKey = await importPublicKey(pair.publicKey)
    const valid = await crypto.subtle.verify('Ed25519', pubKey, signature, message)
    expect(valid).toBe(true)
  })
})

describe('generateStorableKeyPair', () => {
  it('produces extractable private key raw bytes (pkcs8)', async () => {
    const pair = await generateStorableKeyPair()
    expect(pair.publicKey).toBeInstanceOf(Uint8Array)
    expect(pair.publicKey.length).toBe(32)
    expect(pair.privateKeyRaw).toBeInstanceOf(Uint8Array)
    expect(pair.privateKeyRaw.length).toBeGreaterThan(32) // pkcs8 DER encoding
  })

  it('imported private key can sign messages', async () => {
    const pair = await generateStorableKeyPair()
    const privKey = await importPrivateKey(pair.privateKeyRaw)
    const message = new TextEncoder().encode('test message')
    const signature = new Uint8Array(await crypto.subtle.sign('Ed25519', privKey, message))
    expect(signature.length).toBe(64)

    const pubKey = await importPublicKey(pair.publicKey)
    const valid = await crypto.subtle.verify('Ed25519', pubKey, signature, message)
    expect(valid).toBe(true)
  })

  it('encryptPrivateKey + decryptPrivateKey roundtrip produces signing-capable key', async () => {
    const urk = await createTestURK()
    const pair = await generateStorableKeyPair()

    const encrypted = await encryptPrivateKey(pair.privateKeyRaw, urk)
    const decryptedKey = await decryptPrivateKey(encrypted, urk)

    const message = new TextEncoder().encode('roundtrip test')
    const signature = new Uint8Array(await crypto.subtle.sign('Ed25519', decryptedKey, message))

    const pubKey = await importPublicKey(pair.publicKey)
    const valid = await crypto.subtle.verify('Ed25519', pubKey, signature, message)
    expect(valid).toBe(true)
  })
})

describe('exportPublicKey / importPublicKey', () => {
  it('exportPublicKey returns 32 bytes', async () => {
    const pair = await generateDeviceKeyPair()
    const pubKey = await importPublicKey(pair.publicKey)
    const raw = await exportPublicKey(pubKey)
    expect(raw.length).toBe(32)
  })

  it('import → export roundtrip preserves bytes', async () => {
    const pair = await generateDeviceKeyPair()
    const pubKey = await importPublicKey(pair.publicKey)
    const raw = await exportPublicKey(pubKey)
    expect(raw).toEqual(pair.publicKey)
  })

  it('importPublicKey with wrong length throws', async () => {
    const badRaw = new Uint8Array(31)
    await expect(importPublicKey(badRaw)).rejects.toThrow()
  })
})

describe('encryptPrivateKey / decryptPrivateKey', () => {
  it('encryptPrivateKey produces output longer than input (IV + tag overhead)', async () => {
    const urk = await createTestURK()
    const pair = await generateStorableKeyPair()
    const encrypted = await encryptPrivateKey(pair.privateKeyRaw, urk)
    expect(encrypted.byteLength).toBeGreaterThan(pair.privateKeyRaw.length)
    expect(encrypted.byteLength).toBe(pair.privateKeyRaw.length + 12 + 16) // IV + GCM tag
  })

  it('two encryptions of same key produce different ciphertexts (unique IV)', async () => {
    const urk = await createTestURK()
    const pair = await generateStorableKeyPair()
    const enc1 = await encryptPrivateKey(pair.privateKeyRaw, urk)
    const enc2 = await encryptPrivateKey(pair.privateKeyRaw, urk)
    expect(enc1).not.toEqual(enc2)
  })

  it('decryptPrivateKey with wrong URK throws', async () => {
    const urk = await createTestURK()
    const wrongUrk = await crypto.subtle.importKey(
      'raw',
      new Uint8Array(32).fill(0x99),
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt'],
    )
    const pair = await generateStorableKeyPair()
    const encrypted = await encryptPrivateKey(pair.privateKeyRaw, urk)

    await expect(decryptPrivateKey(encrypted, wrongUrk)).rejects.toThrow()
  })

  it('decryptPrivateKey with tampered ciphertext throws', async () => {
    const urk = await createTestURK()
    const pair = await generateStorableKeyPair()
    const encrypted = await encryptPrivateKey(pair.privateKeyRaw, urk)

    const tampered = new Uint8Array(encrypted)
    tampered[tampered.length - 1] ^= 0x01 // flip last byte (GCM tag)
    await expect(decryptPrivateKey(tampered, urk)).rejects.toThrow()
  })

  it('decrypted private key is non-extractable', async () => {
    const urk = await createTestURK()
    const pair = await generateStorableKeyPair()
    const encrypted = await encryptPrivateKey(pair.privateKeyRaw, urk)
    const decryptedKey = await decryptPrivateKey(encrypted, urk)

    expect(decryptedKey.extractable).toBe(false)
    await expect(crypto.subtle.exportKey('raw', decryptedKey)).rejects.toThrow()
  })
})

describe('importPrivateKey', () => {
  it('importPrivateKey creates non-extractable signing key', async () => {
    const storable = await generateStorableKeyPair()
    const key = await importPrivateKey(storable.privateKeyRaw)

    expect(key.type).toBe('private')
    expect(key.algorithm.name).toBe('Ed25519')
    expect(key.extractable).toBe(false)
    expect(key.usages).toContain('sign')
  })

  it('imported key can sign and produce valid signature', async () => {
    const storable = await generateStorableKeyPair()
    const privKey = await importPrivateKey(storable.privateKeyRaw)
    const pubKey = await importPublicKey(storable.publicKey)

    const message = crypto.getRandomValues(new Uint8Array(64))
    const signature = new Uint8Array(await crypto.subtle.sign('Ed25519', privKey, message))
    const valid = await crypto.subtle.verify('Ed25519', pubKey, signature, message)
    expect(valid).toBe(true)
  })
})
