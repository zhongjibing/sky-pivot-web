import { describe, it, expect } from 'vitest'
import {
  encryptDEK,
  decryptDEK,
  encryptVaultItem,
  decryptVaultItem,
  decryptVaultItemsBatch,
  encryptVaultItemsBatch,
} from '@/crypto/vault'
import type { DecryptedVaultItem } from '@/crypto/vault'
import { resolveSyncConflict } from '@/crypto/sync'
import type { SyncConflict } from '@/crypto/sync'

const TEST_DEK_RAW = crypto.getRandomValues(new Uint8Array(32))
const ARBITRARY_DEK_RAW = crypto.getRandomValues(new Uint8Array(32))

async function createTestURK(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new Uint8Array(32).fill(0x42),
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

async function createWrongURK(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new Uint8Array(32).fill(0x99),
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

const sampleItem: DecryptedVaultItem = {
  id: 'item-001',
  title: 'GitHub',
  url: 'https://github.com',
  account: 'user@example.com',
  password: 's3cr3tP@ss!',
  notes: 'Personal account',
  syncVersion: 1,
}

describe('DEK encrypt/decrypt', () => {
  it('encryptDEK produces output larger than plaintext (IV + ciphertext + tag)', async () => {
    const urk = await createTestURK()
    const encrypted = await encryptDEK(TEST_DEK_RAW, urk)
    expect(encrypted.byteLength).toBeGreaterThan(TEST_DEK_RAW.length)
  })

  it('decryptDEK recovers the original DEK as a CryptoKey', async () => {
    const urk = await createTestURK()
    const encrypted = await encryptDEK(TEST_DEK_RAW, urk)
    const dek = await decryptDEK(encrypted, urk)

    expect(dek.type).toBe('secret')
    expect(dek.algorithm.name).toBe('AES-GCM')
    expect(dek.extractable).toBe(false)
  })

  it('DEK decrypt roundtrip: encrypt-then-decrypt produces a usable key', async () => {
    const urk = await createTestURK()
    const encrypted = await encryptDEK(TEST_DEK_RAW, urk)
    const dek = await decryptDEK(encrypted, urk)

    const iv = crypto.getRandomValues(new Uint8Array(12))
    const plaintext = new TextEncoder().encode('verify DEK works')
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, dek, plaintext)
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, dek, ciphertext)

    expect(new TextDecoder().decode(decrypted)).toBe('verify DEK works')
  })

  it('decryptDEK with wrong URK throws (AES-GCM tag mismatch)', async () => {
    const urk = await createTestURK()
    const wrongUrk = await createWrongURK()
    const encrypted = await encryptDEK(TEST_DEK_RAW, urk)

    await expect(decryptDEK(encrypted, wrongUrk)).rejects.toThrow()
  })

  it('encryptDEK produces non-deterministic output (different IV each time)', async () => {
    const urk = await createTestURK()
    const a = await encryptDEK(TEST_DEK_RAW, urk)
    const b = await encryptDEK(TEST_DEK_RAW, urk)

    const hexA = Array.from(new Uint8Array(a))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
    const hexB = Array.from(new Uint8Array(b))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')

    expect(hexA).not.toBe(hexB)
  })
})

describe('vault item encrypt/decrypt', () => {
  it('encryptVaultItem produces EncryptedVaultItem with encrypted fields', async () => {
    const urk = await createTestURK()
    const encryptedDek = await encryptDEK(TEST_DEK_RAW, urk)
    const dek = await decryptDEK(encryptedDek, urk)

    const encrypted = await encryptVaultItem(sampleItem, dek)

    expect(encrypted.id).toBe(sampleItem.id)
    expect(encrypted.syncVersion).toBe(sampleItem.syncVersion)
    expect(encrypted.encryptedDeks.byteLength).toBeGreaterThan(0)
    expect(encrypted.encryptedTitle.byteLength).toBeGreaterThan(0)
    expect(encrypted.encryptedUrl.byteLength).toBeGreaterThan(0)
    expect(encrypted.encryptedAccount.byteLength).toBeGreaterThan(0)
    expect(encrypted.encryptedPassword.byteLength).toBeGreaterThan(0)
    expect(encrypted.encryptedNotes.byteLength).toBeGreaterThan(0)
  })

  it('decryptVaultItem recovers all original fields', async () => {
    const urk = await createTestURK()
    const encryptedDek = await encryptDEK(TEST_DEK_RAW, urk)
    const dek = await decryptDEK(encryptedDek, urk)

    const encrypted = await encryptVaultItem(sampleItem, dek)
    const decrypted = await decryptVaultItem(encrypted, dek)

    expect(decrypted.id).toBe(sampleItem.id)
    expect(decrypted.title).toBe(sampleItem.title)
    expect(decrypted.url).toBe(sampleItem.url)
    expect(decrypted.account).toBe(sampleItem.account)
    expect(decrypted.password).toBe(sampleItem.password)
    expect(decrypted.notes).toBe(sampleItem.notes)
    expect(decrypted.syncVersion).toBe(sampleItem.syncVersion)
  })

  it('same DEK encrypts two records with different RK (encryptedDeks differ)', async () => {
    const urk = await createTestURK()
    const encryptedDek = await encryptDEK(TEST_DEK_RAW, urk)
    const dek = await decryptDEK(encryptedDek, urk)

    const itemA = { ...sampleItem, id: 'item-A' }
    const itemB = { ...sampleItem, id: 'item-B' }

    const encryptedA = await encryptVaultItem(itemA, dek)
    const encryptedB = await encryptVaultItem(itemB, dek)

    const rkA = Array.from(new Uint8Array(encryptedA.encryptedDeks))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
    const rkB = Array.from(new Uint8Array(encryptedB.encryptedDeks))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')

    expect(rkA).not.toBe(rkB)
  })

  it('decryptVaultItem with wrong DEK throws', async () => {
    const urk = await createTestURK()
    const encryptedDek = await encryptDEK(TEST_DEK_RAW, urk)
    const dek = await decryptDEK(encryptedDek, urk)
    const wrongDek = await decryptDEK(await encryptDEK(ARBITRARY_DEK_RAW, urk), urk)

    const encrypted = await encryptVaultItem(sampleItem, dek)

    await expect(decryptVaultItem(encrypted, wrongDek)).rejects.toThrow()
  })

  it('tampered ciphertext (encryptedDeks) throws on decrypt', async () => {
    const urk = await createTestURK()
    const encryptedDek = await encryptDEK(TEST_DEK_RAW, urk)
    const dek = await decryptDEK(encryptedDek, urk)

    const encrypted = await encryptVaultItem(sampleItem, dek)
    const tampered = new Uint8Array(encrypted.encryptedDeks)
    tampered[0] ^= 0xff
    const corrupted = { ...encrypted, encryptedDeks: tampered.buffer.slice(0) }

    await expect(decryptVaultItem(corrupted, dek)).rejects.toThrow()
  })

  it('handles empty string fields', async () => {
    const urk = await createTestURK()
    const encryptedDek = await encryptDEK(TEST_DEK_RAW, urk)
    const dek = await decryptDEK(encryptedDek, urk)

    const item: DecryptedVaultItem = {
      id: 'empty-fields',
      title: 'Title Only',
      url: '',
      account: '',
      password: 'p@ss',
      notes: '',
      syncVersion: 1,
    }

    const encrypted = await encryptVaultItem(item, dek)
    const decrypted = await decryptVaultItem(encrypted, dek)

    expect(decrypted.title).toBe('Title Only')
    expect(decrypted.url).toBe('')
    expect(decrypted.account).toBe('')
    expect(decrypted.password).toBe('p@ss')
    expect(decrypted.notes).toBe('')
  })

  it('handles unicode characters (emoji, CJK)', async () => {
    const urk = await createTestURK()
    const encryptedDek = await encryptDEK(TEST_DEK_RAW, urk)
    const dek = await decryptDEK(encryptedDek, urk)

    const item: DecryptedVaultItem = {
      id: 'unicode',
      title: '测试账户 🔐',
      url: 'https://テスト.example.com/パス',
      account: '用户@测试.cn',
      password: 'パスワード🔑!',
      notes: '备注信息 📝 — émojis & CJK',
      syncVersion: 2,
    }

    const encrypted = await encryptVaultItem(item, dek)
    const decrypted = await decryptVaultItem(encrypted, dek)

    expect(decrypted.title).toBe('测试账户 🔐')
    expect(decrypted.url).toBe('https://テスト.example.com/パス')
    expect(decrypted.account).toBe('用户@测试.cn')
    expect(decrypted.password).toBe('パスワード🔑!')
    expect(decrypted.notes).toBe('备注信息 📝 — émojis & CJK')
  })

  it('handles very long fields', async () => {
    const urk = await createTestURK()
    const encryptedDek = await encryptDEK(TEST_DEK_RAW, urk)
    const dek = await decryptDEK(encryptedDek, urk)

    const longString = 'A'.repeat(10000)
    const item: DecryptedVaultItem = {
      id: 'long-fields',
      title: 'Long',
      url: longString,
      account: longString,
      password: longString,
      notes: longString,
      syncVersion: 1,
    }

    const encrypted = await encryptVaultItem(item, dek)
    const decrypted = await decryptVaultItem(encrypted, dek)

    expect(decrypted.url).toBe(longString)
    expect(decrypted.notes).toBe(longString)
  })
})

describe('batch operations', () => {
  it('encryptVaultItemsBatch + decryptVaultItemsBatch roundtrip', async () => {
    const urk = await createTestURK()
    const encryptedDek = await encryptDEK(TEST_DEK_RAW, urk)
    const dek = await decryptDEK(encryptedDek, urk)

    const items: DecryptedVaultItem[] = Array.from({ length: 100 }, (_, i) => ({
      id: `item-${String(i).padStart(4, '0')}`,
      title: `Title ${i}`,
      url: `https://example.com/${i}`,
      account: `user${i}@example.com`,
      password: `password-${i}`,
      notes: `Notes for item ${i}`,
      syncVersion: i,
    }))

    const encrypted = await encryptVaultItemsBatch(items, dek)
    expect(encrypted).toHaveLength(100)

    const decrypted = await decryptVaultItemsBatch(encrypted, dek)
    expect(decrypted).toHaveLength(100)

    for (let i = 0; i < 100; i++) {
      expect(decrypted[i].id).toBe(items[i].id)
      expect(decrypted[i].title).toBe(items[i].title)
      expect(decrypted[i].password).toBe(items[i].password)
    }
  })

  it('batch decrypt with one corrupted item fails the entire batch', async () => {
    const urk = await createTestURK()
    const encryptedDek = await encryptDEK(TEST_DEK_RAW, urk)
    const dek = await decryptDEK(encryptedDek, urk)

    const item: DecryptedVaultItem = { ...sampleItem, id: 'ok' }
    const encrypted = await encryptVaultItem(item, dek)
    const tampered = new Uint8Array(encrypted.encryptedDeks)
    tampered[0] ^= 0xff
    const corrupted = { ...encrypted, encryptedDeks: tampered.buffer.slice(0), id: 'corrupted' }

    await expect(decryptVaultItemsBatch([encrypted, corrupted], dek)).rejects.toThrow()
  })

  it('batch operations are concurrent (same DEK works for all items)', async () => {
    const urk = await createTestURK()
    const encryptedDek = await encryptDEK(TEST_DEK_RAW, urk)
    const dek = await decryptDEK(encryptedDek, urk)

    const items: DecryptedVaultItem[] = Array.from({ length: 50 }, (_, i) => ({
      id: `batch-${i}`,
      title: `T${i}`,
      url: '',
      account: '',
      password: `p${i}`,
      notes: '',
      syncVersion: 1,
    }))

    const encrypted = await encryptVaultItemsBatch(items, dek)
    const decrypted = await decryptVaultItemsBatch(encrypted, dek)

    const ids = decrypted.map((d) => d.id).sort()
    expect(ids).toEqual(items.map((i) => i.id).sort())
  })
})

describe('resolveSyncConflict', () => {
  it('returns remote when remote version is higher', () => {
    const local = new Uint8Array([1, 2, 3])
    const remote = new Uint8Array([4, 5, 6])
    const conflict: SyncConflict = { localVersion: 1, remoteVersion: 2, field: 'encryptedTitle' }

    const result = resolveSyncConflict(local, remote, conflict)
    expect(result).toBe(remote)
  })

  it('returns local when local version is higher', () => {
    const local = new Uint8Array([1, 2, 3])
    const remote = new Uint8Array([4, 5, 6])
    const conflict: SyncConflict = { localVersion: 3, remoteVersion: 2, field: 'encryptedTitle' }

    const result = resolveSyncConflict(local, remote, conflict)
    expect(result).toBe(local)
  })

  it('returns local when versions are equal', () => {
    const local = new Uint8Array([1, 2, 3])
    const remote = new Uint8Array([4, 5, 6])
    const conflict: SyncConflict = { localVersion: 2, remoteVersion: 2, field: 'encryptedTitle' }

    const result = resolveSyncConflict(local, remote, conflict)
    expect(result).toBe(local)
  })
})
