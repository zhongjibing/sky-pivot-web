import { getDek } from './vault'
import type { EncryptedVaultItem, DecryptedVaultItem } from './vault'
import { encryptVaultItem, decryptVaultItem, decryptVaultItemsBatch } from './vault'
import { checkStrength } from './password-gen'

export interface VaultBlobData {
  encryptedDeks: string
  encryptedTitle: string
  encryptedUrl: string
  encryptedAccount: string
  encryptedPassword: string
  encryptedNotes: string
}

export function packEncryptedBlob(item: EncryptedVaultItem): string {
  const blob: VaultBlobData = {
    encryptedDeks: arrayBufferToBase64(item.encryptedDeks),
    encryptedTitle: arrayBufferToBase64(item.encryptedTitle),
    encryptedUrl: arrayBufferToBase64(item.encryptedUrl),
    encryptedAccount: arrayBufferToBase64(item.encryptedAccount),
    encryptedPassword: arrayBufferToBase64(item.encryptedPassword),
    encryptedNotes: arrayBufferToBase64(item.encryptedNotes),
  }
  return JSON.stringify(blob)
}

export function unpackEncryptedBlob(blobJson: string): EncryptedVaultItem | null {
  try {
    const data: VaultBlobData = JSON.parse(blobJson)
    return {
      id: '',
      encryptedDeks: base64ToArrayBuffer(data.encryptedDeks),
      encryptedTitle: base64ToArrayBuffer(data.encryptedTitle),
      encryptedUrl: base64ToArrayBuffer(data.encryptedUrl),
      encryptedAccount: base64ToArrayBuffer(data.encryptedAccount),
      encryptedPassword: base64ToArrayBuffer(data.encryptedPassword),
      encryptedNotes: base64ToArrayBuffer(data.encryptedNotes),
      syncVersion: 0,
    }
  } catch {
    return null
  }
}

export async function decryptBlob(blobJson: string, itemId: string, version: number): Promise<DecryptedVaultItem | null> {
  const dek = getDek()
  if (!dek) return null

  const encrypted = unpackEncryptedBlob(blobJson)
  if (!encrypted) return null

  encrypted.id = itemId
  encrypted.syncVersion = version

  try {
    const decrypted = await decryptVaultItem(encrypted, dek)
    return decrypted
  } catch {
    return null
  }
}

export async function decryptBlobsBatch(
  items: Array<{ itemId: string; encryptedBlob: string; version: number }>,
): Promise<DecryptedVaultItem[]> {
  const dek = getDek()
  if (!dek) return []

  const encryptedItems: EncryptedVaultItem[] = []
  for (const item of items) {
    const encrypted = unpackEncryptedBlob(item.encryptedBlob)
    if (encrypted) {
      encrypted.id = item.itemId
      encrypted.syncVersion = item.version
      encryptedItems.push(encrypted)
    }
  }

  try {
    return await decryptVaultItemsBatch(encryptedItems, dek)
  } catch {
    return []
  }
}

export async function encryptBlob(item: DecryptedVaultItem): Promise<{ encryptedBlob: string; encryptedItem: EncryptedVaultItem } | null> {
  const dek = getDek()
  if (!dek) return null

  try {
    const encrypted = await encryptVaultItem(item, dek)
    const blob = packEncryptedBlob(encrypted)
    return { encryptedBlob: blob, encryptedItem: encrypted }
  } catch {
    return null
  }
}

export function computeHealth(password: string): { healthScore: number; healthLevel: string } {
  const result = checkStrength(password)
  return {
    healthScore: result.score,
    healthLevel: result.level,
  }
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes.buffer
}
