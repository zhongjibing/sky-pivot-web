/**
 * Vault item encryption/decryption using Web Crypto API
 *
 * Hierarchy:
 *  URK → AES-GCM(DEK) → AES-GCM(RK) → AES-GCM(field)
 *
 * Each vault item field is encrypted with a per-record Record Key (RK).
 */

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

export async function encryptVaultItem(
  _item: DecryptedVaultItem,
  _urk: CryptoKey,
): Promise<EncryptedVaultItem> {
  throw new Error('Not implemented — Phase 2.1.3')
}

export async function decryptVaultItem(
  _item: EncryptedVaultItem,
  _urk: CryptoKey,
): Promise<DecryptedVaultItem> {
  throw new Error('Not implemented — Phase 2.1.3')
}

export async function decryptVaultItemsBatch(
  _items: EncryptedVaultItem[],
  _urk: CryptoKey,
): Promise<DecryptedVaultItem[]> {
  throw new Error('Not implemented — Phase 2.1.3')
}
