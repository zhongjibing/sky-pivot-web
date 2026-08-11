/**
 * Ed25519 device key management
 *
 * Each device generates an Ed25519 keypair at registration.
 * The private key NEVER leaves the device — only the encrypted seed is stored in IndexedDB.
 * The public key is uploaded to the server for AT verification.
 *
 * Key lifecycle:
 *   1. Registration: generateStorableKeyPair() → encryptPrivateKey() → store in IndexedDB
 *   2. Login: decryptPrivateKey() → import as non-extractable CryptoKey → generateDeviceKeyPair()
 *   3. Active use: sign AT + DeviceSig with non-extractable CryptoKey
 *   4. Memory cleanup: the CryptoKey is garbage-collectable; encrypted seed in IndexedDB persists
 */

import { memzero } from './memory'

const enc = new TextEncoder()
const dec = new TextDecoder()

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')
}

export function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error('Invalid hex string')
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16)
  }
  return bytes
}

export interface DeviceKeyPair {
  publicKey: Uint8Array
  privateKey: CryptoKey
}

export interface StorableKeyPair {
  publicKey: Uint8Array
  privateKeyRaw: Uint8Array
}

/**
 * Generate an Ed25519 key pair for active use.
 * The private key is non-extractable — cannot leave the CryptoKey handle.
 */
export async function generateDeviceKeyPair(): Promise<DeviceKeyPair> {
  const pair = (await crypto.subtle.generateKey(
    { name: 'Ed25519' },
    false,
    ['sign', 'verify'],
  )) as CryptoKeyPair

  const publicKeyRaw = await exportPublicKey(pair.publicKey)

  return {
    publicKey: new Uint8Array(publicKeyRaw),
    privateKey: pair.privateKey,
  }
}

/**
 * Generate a storable Ed25519 key pair.
 * The private key is extractable so it can be encrypted with URK for IndexedDB storage.
 * Caller MUST encrypt privateKeyRaw with URK and memzero it afterwards.
 */
export async function generateStorableKeyPair(): Promise<StorableKeyPair> {
  const pair = (await crypto.subtle.generateKey(
    { name: 'Ed25519' },
    true,
    ['sign', 'verify'],
  )) as CryptoKeyPair

  const publicKeyRaw = await exportPublicKey(pair.publicKey)
  const privateKeyRaw = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey))

  return {
    publicKey: new Uint8Array(publicKeyRaw),
    privateKeyRaw,
  }
}

/**
 * Export Ed25519 public key as raw bytes (32 bytes).
 */
export async function exportPublicKey(key: CryptoKey): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.exportKey('raw', key))
}

/**
 * Import raw bytes as Ed25519 public key for verification.
 */
export async function importPublicKey(raw: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    raw,
    { name: 'Ed25519' },
    true,
    ['verify'],
  )
}

/**
 * Encrypt Ed25519 private key seed with URK for IndexedDB storage.
 * Format: IV (12 bytes) + ciphertext + GCM tag (16 bytes).
 */
export async function encryptPrivateKey(privateKeyRaw: Uint8Array, urk: CryptoKey): Promise<Uint8Array> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    urk,
    privateKeyRaw,
  ))

  const result = new Uint8Array(iv.length + ciphertext.length)
  result.set(iv)
  result.set(ciphertext, iv.length)
  return result
}

/**
 * Decrypt private key seed from IndexedDB and import as non-extractable CryptoKey.
 */
export async function decryptPrivateKey(encryptedKey: Uint8Array, urk: CryptoKey): Promise<CryptoKey> {
  const iv = encryptedKey.slice(0, 12)
  const ciphertext = encryptedKey.slice(12)

  const privateKeyRaw = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    urk,
    ciphertext,
  )

  return crypto.subtle.importKey(
    'pkcs8',
    privateKeyRaw,
    { name: 'Ed25519' },
    false,
    ['sign'],
  )
}

/**
 * Import raw Ed25519 private key bytes as non-extractable CryptoKey.
 */
export async function importPrivateKey(raw: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'pkcs8',
    raw,
    { name: 'Ed25519' },
    false,
    ['sign'],
  )
}

export interface X25519KeyPair {
  publicKey: Uint8Array
  privateKey: CryptoKey
}

export async function generateTempX25519KeyPair(): Promise<X25519KeyPair> {
  const pair = (await crypto.subtle.generateKey(
    { name: 'X25519' },
    false,
    ['deriveBits'],
  )) as CryptoKeyPair

  const publicKeyRaw = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey))

  return {
    publicKey: publicKeyRaw,
    privateKey: pair.privateKey,
  }
}

export async function exportX25519PublicKey(key: CryptoKey): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.exportKey('raw', key))
}

export async function importX25519PublicKey(raw: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    raw,
    { name: 'X25519' },
    true,
    [],
  )
}

export async function computeFingerprint(publicKeyBase64: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', enc.encode(publicKeyBase64))
  return bytesToHex(new Uint8Array(hash)).substring(0, 8)
}

export async function ecdhEncryptDEK(
  dekRaw: Uint8Array,
  receiverPublicKeyRaw: Uint8Array,
  senderPublicKeyRaw: Uint8Array,
  senderPrivateKey: CryptoKey,
): Promise<{ encryptedDek: string; senderPublicKey: string; iv: string }> {
  const receiverPubKey = await importX25519PublicKey(receiverPublicKeyRaw)

  const sharedSecret = await crypto.subtle.deriveBits(
    { name: 'X25519', public: receiverPubKey },
    senderPrivateKey,
    256,
  )

  const iv = crypto.getRandomValues(new Uint8Array(12))
  const aesKey = await deriveAesKeyFromSharedSecret(sharedSecret)

  const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    dekRaw,
  ))

  return {
    encryptedDek: bytesToHex(ciphertext),
    senderPublicKey: bytesToHex(senderPublicKeyRaw),
    iv: bytesToHex(iv),
  }
}

export async function ecdhDecryptDEK(
  encryptedDek: string,
  senderPublicKeyHex: string,
  ivHex: string,
  receiverPrivateKey: CryptoKey,
): Promise<Uint8Array> {
  const senderPkBytes = hexToBytes(senderPublicKeyHex)
  const senderPublicKey = await importX25519PublicKey(senderPkBytes)

  const sharedSecret = await crypto.subtle.deriveBits(
    { name: 'X25519', public: senderPublicKey },
    receiverPrivateKey,
    256,
  )

  const aesKey = await deriveAesKeyFromSharedSecret(sharedSecret)

  const iv = hexToBytes(ivHex)
  const ciphertext = hexToBytes(encryptedDek)

  const plaintext = new Uint8Array(await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    ciphertext,
  ))

  return plaintext
}

export async function ecdhEncryptForResponse(
  plaintext: Uint8Array,
  peerPublicKeyRaw: Uint8Array,
  myPrivateKey: CryptoKey,
): Promise<{ ciphertext: string; iv: string }> {
  const peerPublicKey = await importX25519PublicKey(peerPublicKeyRaw)

  const sharedSecret = await crypto.subtle.deriveBits(
    { name: 'X25519', public: peerPublicKey },
    myPrivateKey,
    256,
  )

  const iv = crypto.getRandomValues(new Uint8Array(12))
  const aesKey = await deriveAesKeyFromSharedSecret(sharedSecret)

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    plaintext,
  )

  return {
    ciphertext: bytesToHex(new Uint8Array(ciphertext)),
    iv: bytesToHex(iv),
  }
}

export async function ecdhDecryptFromResponse(
  ciphertextHex: string,
  ivHex: string,
  peerPublicKeyRaw: Uint8Array,
  myPrivateKey: CryptoKey,
): Promise<Uint8Array> {
  const peerPublicKey = await importX25519PublicKey(peerPublicKeyRaw)

  const sharedSecret = await crypto.subtle.deriveBits(
    { name: 'X25519', public: peerPublicKey },
    myPrivateKey,
    256,
  )

  const aesKey = await deriveAesKeyFromSharedSecret(sharedSecret)

  const iv = hexToBytes(ivHex)
  const ciphertext = hexToBytes(ciphertextHex)

  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    ciphertext,
  )

  return new Uint8Array(plaintext)
}

async function deriveAesKeyFromSharedSecret(sharedSecret: ArrayBuffer): Promise<CryptoKey> {
  const hash = await crypto.subtle.digest('SHA-256', sharedSecret)
  return crypto.subtle.importKey(
    'raw',
    hash.slice(0, 32),
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

