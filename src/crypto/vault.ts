/**
 * Vault item encryption/decryption using Web Crypto API
 *
 * Hierarchy:
 *  URK → AES-GCM(DEK) → AES-GCM(RK) → AES-GCM(field)
 *
 * Each vault item field is encrypted with a per-record Record Key (RK).
 * The RK is encrypted with the Data Encryption Key (DEK).
 * The DEK is encrypted with the User Root Key (URK).
 */

import { memzero } from './memory'

const IV_LENGTH = 12
const RK_LENGTH = 32
const AES_KEY_LENGTH = 256

export interface EncryptedVaultItem {
  id: string
  encryptedDeks: ArrayBuffer
  encryptedTitle: ArrayBuffer
  encryptedUrl: ArrayBuffer
  encryptedAccount: ArrayBuffer
  encryptedPassword: ArrayBuffer
  encryptedNotes: ArrayBuffer
  syncVersion: number
}

export interface DecryptedVaultItem {
  id: string
  title: string
  url: string
  account: string
  password: string
  notes: string
  syncVersion: number
}

// --- Internal helpers ---

function generateIV(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(IV_LENGTH))
}

function packEncrypted(iv: Uint8Array, ciphertext: ArrayBuffer): ArrayBuffer {
  const result = new Uint8Array(iv.length + ciphertext.byteLength)
  result.set(iv, 0)
  result.set(new Uint8Array(ciphertext), iv.length)
  return result.buffer
}

function unpackEncrypted(packed: ArrayBuffer): { iv: Uint8Array; ciphertext: Uint8Array } {
  const bytes = new Uint8Array(packed)
  return {
    iv: bytes.slice(0, IV_LENGTH),
    ciphertext: bytes.slice(IV_LENGTH),
  }
}

async function aesGcmEncrypt(key: CryptoKey, plaintext: Uint8Array): Promise<ArrayBuffer> {
  const iv = generateIV()
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    plaintext as BufferSource,
  )
  return packEncrypted(iv, ciphertext)
}

async function aesGcmDecrypt(key: CryptoKey, packed: ArrayBuffer): Promise<Uint8Array> {
  const { iv, ciphertext } = unpackEncrypted(packed)
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    ciphertext as BufferSource,
  )
  return new Uint8Array(plaintext)
}

async function importAesGcmKey(raw: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    raw as BufferSource,
    { name: 'AES-GCM', length: AES_KEY_LENGTH },
    false,
    ['encrypt', 'decrypt'],
  )
}

// --- DEK encryption ---

export async function encryptDEK(dekRaw: Uint8Array, urk: CryptoKey): Promise<ArrayBuffer> {
  return aesGcmEncrypt(urk, dekRaw)
}

export async function decryptDEK(encryptedDek: ArrayBuffer, urk: CryptoKey): Promise<CryptoKey> {
  const dekRaw = await aesGcmDecrypt(urk, encryptedDek)
  const key = await importAesGcmKey(dekRaw)
  memzero(dekRaw)
  return key
}

// --- Vault item encryption ---

export async function encryptVaultItem(
  item: DecryptedVaultItem,
  dek: CryptoKey,
): Promise<EncryptedVaultItem> {
  const rkRaw = crypto.getRandomValues(new Uint8Array(RK_LENGTH))
  const rkKey = await importAesGcmKey(rkRaw)

  const encoder = new TextEncoder()

  const [encryptedRk, encryptedTitle, encryptedUrl, encryptedAccount, encryptedPassword, encryptedNotes] =
    await Promise.all([
      aesGcmEncrypt(dek, rkRaw),
      aesGcmEncrypt(rkKey, encoder.encode(item.title)),
      aesGcmEncrypt(rkKey, encoder.encode(item.url)),
      aesGcmEncrypt(rkKey, encoder.encode(item.account)),
      aesGcmEncrypt(rkKey, encoder.encode(item.password)),
      aesGcmEncrypt(rkKey, encoder.encode(item.notes)),
    ])

  memzero(rkRaw)

  return {
    id: item.id,
    encryptedDeks: encryptedRk,
    encryptedTitle,
    encryptedUrl,
    encryptedAccount,
    encryptedPassword,
    encryptedNotes,
    syncVersion: item.syncVersion,
  }
}

export async function decryptVaultItem(
  item: EncryptedVaultItem,
  dek: CryptoKey,
): Promise<DecryptedVaultItem> {
  const rkRaw = await aesGcmDecrypt(dek, item.encryptedDeks)
  const rkKey = await importAesGcmKey(rkRaw)
  memzero(rkRaw)

  const decoder = new TextDecoder()

  const [title, url, account, password, notes] = await Promise.all([
    aesGcmDecrypt(rkKey, item.encryptedTitle).then((b) => decoder.decode(b)),
    aesGcmDecrypt(rkKey, item.encryptedUrl).then((b) => decoder.decode(b)),
    aesGcmDecrypt(rkKey, item.encryptedAccount).then((b) => decoder.decode(b)),
    aesGcmDecrypt(rkKey, item.encryptedPassword).then((b) => decoder.decode(b)),
    aesGcmDecrypt(rkKey, item.encryptedNotes).then((b) => decoder.decode(b)),
  ])

  return {
    id: item.id,
    title,
    url,
    account,
    password,
    notes,
    syncVersion: item.syncVersion,
  }
}

export async function decryptVaultItemsBatch(
  items: EncryptedVaultItem[],
  dek: CryptoKey,
): Promise<DecryptedVaultItem[]> {
  return Promise.all(items.map((item) => decryptVaultItem(item, dek)))
}

export async function encryptVaultItemsBatch(
  items: DecryptedVaultItem[],
  dek: CryptoKey,
): Promise<EncryptedVaultItem[]> {
  return Promise.all(items.map((item) => encryptVaultItem(item, dek)))
}
