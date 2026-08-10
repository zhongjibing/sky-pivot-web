/**
 * BIP39 recovery code generation + recovery key derivation
 *
 * Registry flow:
 *   1) Generate 12-word BIP39 mnemonic (128-bit entropy)
 *   2) Derive recoveryKey = PBKDF2(mnemonic, recoverySalt, 100000, SHA-256, 32B)
 *   3) recoveryKeyHash = SHA-256(recoveryKey) — stored on server for verification
 *   4) encryptedUrkRecovery = AES-GCM(URK, recoveryKey) — encrypted URK backup
 */

import { mnemonicToSeedSync, generateMnemonic, validateMnemonic } from '@scure/bip39'
import { wordlist } from '@scure/bip39/wordlists/english.js'

const RECOVERY_PBKDF2_ITERATIONS = 100000
const RECOVERY_KEY_LENGTH = 32

export interface RecoveryBundle {
  words: string[]
  recoverySalt: Uint8Array
  recoveryKeyHash: Uint8Array
  encryptedUrkRecovery: Uint8Array
}

/**
 * Generate a 12-word BIP39 recovery code (128-bit entropy).
 */
export function generateRecoveryCode(): string[] {
  const mnemonic = generateMnemonic(wordlist, 128)
  return mnemonic.split(' ')
}

/**
 * Validate a recovery code. Returns true if it's a valid BIP39 mnemonic.
 */
export function validateRecoveryCode(words: string[]): boolean {
  return validateMnemonic(words.join(' '), wordlist)
}

/**
 * Verify specific word positions in a recovery code (e.g., word 3, 6, 9).
 */
export function verifyRecoveryWords(
  words: string[],
  expected: { position: number; word: string }[],
): boolean {
  for (const { position, word } of expected) {
    if (position < 1 || position > words.length) return false
    if (words[position - 1] !== word) return false
  }
  return true
}

/**
 * Derive the recovery key from the recovery code using PBKDF2.
 */
export async function deriveRecoveryKey(
  words: string[],
  recoverySalt: Uint8Array,
): Promise<CryptoKey> {
  const mnemonic = words.join(' ')
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(mnemonic),
    { name: 'PBKDF2' },
    false,
    ['deriveBits', 'deriveKey'],
  )

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: recoverySalt,
      iterations: RECOVERY_PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

/**
 * Compute SHA-256 hash of the recovery key for server-side verification.
 */
export async function computeRecoveryKeyHash(recoveryKey: CryptoKey): Promise<Uint8Array> {
  const rawKey = await crypto.subtle.exportKey('raw', recoveryKey)
  const hash = await crypto.subtle.digest('SHA-256', rawKey)
  return new Uint8Array(hash)
}

/**
 * Encrypt URK with the recovery key for emergency backup.
 * Format: IV(12B) + ciphertext + GCM tag(16B).
 */
export async function encryptUrkForRecovery(
  urk: CryptoKey,
  recoveryKey: CryptoKey,
): Promise<Uint8Array> {
  const urkRaw = new Uint8Array(await crypto.subtle.exportKey('raw', urk))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    recoveryKey,
    urkRaw,
  ))

  const result = new Uint8Array(iv.length + ciphertext.length)
  result.set(iv)
  result.set(ciphertext, iv.length)
  return result
}

/**
 * Decrypt URK from the recovery backup.
 */
export async function decryptUrkFromRecovery(
  encryptedUrk: Uint8Array,
  recoveryKey: CryptoKey,
): Promise<CryptoKey> {
  const iv = encryptedUrk.slice(0, 12)
  const ciphertext = encryptedUrk.slice(12)

  const urkRaw = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    recoveryKey,
    ciphertext,
  )

  return crypto.subtle.importKey(
    'raw',
    urkRaw,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

/**
 * Full recovery bundle creation during registration.
 */
export async function createRecoveryBundle(urk: CryptoKey): Promise<RecoveryBundle> {
  const words = generateRecoveryCode()
  const recoverySalt = crypto.getRandomValues(new Uint8Array(16))
  const recoveryKey = await deriveRecoveryKey(words, recoverySalt)
  const recoveryKeyHash = await computeRecoveryKeyHash(recoveryKey)
  const encryptedUrkRecovery = await encryptUrkForRecovery(urk, recoveryKey)

  return { words, recoverySalt, recoveryKeyHash, encryptedUrkRecovery }
}
