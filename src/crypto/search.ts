/**
 * Search index backed by IndexedDB
 *
 * Title/account/URL tokens are stored in plaintext (IndexedDB origin-sandboxed).
 * Notes tokens are encrypted with a dedicated index key derived from URK via HKDF.
 * Passwords are never indexed.
 *
 * Search weight scheme:
 *   title   - 10
 *   account - 8
 *   url     - 5
 *   notes   - 3  (only searched when query > 3 chars)
 *
 * Index key: HKDF-SHA256(URK_raw, salt=zero-filled, info="search-index", 32B)
 */

import { getDb, putItem, getItem, deleteItem, clearStore } from '@/db/indexeddb'
import type { DecryptedVaultItem } from './vault'

const DB_NAME = 'sky-pivot-search'
const TOKENS_STORE = 'tokens'
const NOTES_STORE = 'notesTokens'

const WEIGHT_TITLE = 10
const WEIGHT_ACCOUNT = 8
const WEIGHT_URL = 5
const WEIGHT_NOTES = 3

const MIN_QUERY_LENGTH_FOR_NOTES = 3
const IV_LENGTH = 12

interface SearchTokenRecord {
  id?: number
  itemId: string
  token: string
  field: string
  weight: number
}

interface EncryptedNotesRecord {
  itemId: string
  encryptedTokensB64: string
}

interface SearchResult {
  itemId: string
  score: number
}

let indexKey: CryptoKey | null = null

export function getSearchIndexKey(): CryptoKey | null {
  return indexKey
}

export function clearSearchIndexKey(): void {
  indexKey = null
}

async function toBase64(buf: ArrayBuffer): Promise<string> {
  let binary = ''
  const bytes = new Uint8Array(buf)
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

async function fromBase64(b64: string): Promise<ArrayBuffer> {
  const binary = atob(b64)
  const buf = new ArrayBuffer(binary.length)
  const bytes = new Uint8Array(buf)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return buf
}

function tokenize(text: string): string[] {
  if (!text || text.trim().length === 0) return []

  const normalized = text.toLowerCase().trim()

  // Split on whitespace and CJK-safe boundaries, filter empty
  const raw = normalized.split(/[\s\u3000\u30fb《》【】「」『』（）［］\n\r\t.,;:!?@#$%^&*()\[\]{}|\\/"'-]+/)

  const tokens: string[] = []
  for (const t of raw) {
    const trimmed = t.trim()
    if (trimmed.length > 0) {
      tokens.push(trimmed)
    }
  }

  // CJK-aware: single chars in CJK range are valid tokens
  const cjkRange = /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/
  const hasCJK = cjkRange.test(normalized)

  if (hasCJK) {
    const cjkTokens: string[] = []
    for (const char of normalized) {
      if (cjkRange.test(char) && !char.match(/\s/)) {
        cjkTokens.push(char)
      }
    }
    tokens.push(...cjkTokens)
  }

  return [...new Set(tokens)].filter((t) => t.length > 0)
}

async function encryptNotesTokens(tokens: string[]): Promise<string> {
  if (!indexKey) throw new Error('Search index not initialized. Call initSearchIndex first.')

  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH))
  const plaintext = new TextEncoder().encode(JSON.stringify(tokens))

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    indexKey,
    plaintext,
  )

  const payload = {
    iv: await toBase64(iv.buffer),
    ciphertext: await toBase64(ciphertext),
  }

  return JSON.stringify(payload)
}

async function decryptNotesTokens(encrypted: string): Promise<string[]> {
  if (!indexKey) throw new Error('Search index not initialized. Call initSearchIndex first.')

  const { iv, ciphertext } = JSON.parse(encrypted)

  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: new Uint8Array(await fromBase64(iv)) },
    indexKey,
    await fromBase64(ciphertext),
  )

  return JSON.parse(new TextDecoder().decode(plaintext))
}

export async function initSearchIndex(urkRaw: ArrayBuffer): Promise<void> {
  if (indexKey) return

  const hkdfSource = await crypto.subtle.importKey(
    'raw',
    urkRaw,
    { name: 'HKDF' },
    false,
    ['deriveKey'],
  )

  indexKey = await crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(32),
      info: new TextEncoder().encode('search-index'),
    },
    hkdfSource,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

async function deleteTokensByItemId(itemId: string): Promise<void> {
  const db = await getDb(DB_NAME)
  return new Promise((resolve, reject) => {
    const tx = db.transaction(TOKENS_STORE, 'readwrite')
    const store = tx.objectStore(TOKENS_STORE)
    const index = store.index('itemId')
    const range = IDBKeyRange.only(itemId)
    const req = index.openCursor(range)

    req.onsuccess = () => {
      const cursor = req.result
      if (cursor) {
        cursor.delete()
        cursor.continue()
      }
      // When cursor is null, the transaction will auto-commit
    }
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function indexItem(item: DecryptedVaultItem): Promise<void> {
  if (!indexKey) throw new Error('Search index not initialized. Call initSearchIndex first.')

  await deleteTokensByItemId(item.id)
  await deleteItem(DB_NAME, NOTES_STORE, item.id)

  const tokens: SearchTokenRecord[] = []

  const titleTokens = tokenize(item.title)
  for (const token of titleTokens) {
    tokens.push({ itemId: item.id, token, field: 'title', weight: WEIGHT_TITLE })
  }

  const accountTokens = tokenize(item.account)
  for (const token of accountTokens) {
    tokens.push({ itemId: item.id, token, field: 'account', weight: WEIGHT_ACCOUNT })
  }

  const urlTokens = tokenize(item.url)
  for (const token of urlTokens) {
    tokens.push({ itemId: item.id, token, field: 'url', weight: WEIGHT_URL })
  }

  const db = await getDb(DB_NAME)
  if (tokens.length > 0) {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(TOKENS_STORE, 'readwrite')
      const store = tx.objectStore(TOKENS_STORE)
      for (const record of tokens) {
        store.put(record)
      }
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  }

  const notesTokens = tokenize(item.notes)
  if (notesTokens.length > 0) {
    const encrypted = await encryptNotesTokens(notesTokens)
    await putItem(DB_NAME, NOTES_STORE, {
      itemId: item.id,
      encryptedTokensB64: encrypted,
    })
  }
}

export async function buildFullIndex(items: DecryptedVaultItem[]): Promise<void> {
  if (!indexKey) throw new Error('Search index not initialized. Call initSearchIndex first.')

  if (items.length === 0) {
    await clearIndex()
    return
  }

  await clearIndex()

  const db = await getDb(DB_NAME)

  // Batch all plaintext tokens in one transaction
  const allTokenRecords: SearchTokenRecord[] = []
  const notesRecords: EncryptedNotesRecord[] = []

  for (const item of items) {
    const titleTokens = tokenize(item.title)
    for (const token of titleTokens) {
      allTokenRecords.push({ itemId: item.id, token, field: 'title', weight: WEIGHT_TITLE })
    }

    const accountTokens = tokenize(item.account)
    for (const token of accountTokens) {
      allTokenRecords.push({ itemId: item.id, token, field: 'account', weight: WEIGHT_ACCOUNT })
    }

    const urlTokens = tokenize(item.url)
    for (const token of urlTokens) {
      allTokenRecords.push({ itemId: item.id, token, field: 'url', weight: WEIGHT_URL })
    }

    const notesTokens = tokenize(item.notes)
    if (notesTokens.length > 0) {
      const encrypted = await encryptNotesTokens(notesTokens)
      notesRecords.push({ itemId: item.id, encryptedTokensB64: encrypted })
    }
  }

  if (allTokenRecords.length > 0) {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(TOKENS_STORE, 'readwrite')
      const store = tx.objectStore(TOKENS_STORE)
      for (const record of allTokenRecords) {
        store.put(record)
      }
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  }

  if (notesRecords.length > 0) {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(NOTES_STORE, 'readwrite')
      const store = tx.objectStore(NOTES_STORE)
      for (const record of notesRecords) {
        store.put(record)
      }
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  }
}

export async function deleteSearchItem(itemId: string): Promise<void> {
  await deleteTokensByItemId(itemId)
  await deleteItem(DB_NAME, NOTES_STORE, itemId)
}

export async function clearIndex(): Promise<void> {
  await clearStore(DB_NAME, TOKENS_STORE)
  await clearStore(DB_NAME, NOTES_STORE)
}

async function searchPlaintextTokens(queryTokens: string[]): Promise<Map<string, number>> {
  const scores = new Map<string, number>()

  const db = await getDb(DB_NAME)
  const tx = db.transaction(TOKENS_STORE, 'readonly')
  const store = tx.objectStore(TOKENS_STORE)
  const tokenIndex = store.index('token')

  for (const queryToken of queryTokens) {
    await new Promise<void>((resolve, reject) => {
      const range = IDBKeyRange.only(queryToken)
      const req = tokenIndex.openCursor(range)

      req.onsuccess = () => {
        const cursor = req.result
        if (cursor) {
          const record = cursor.value as SearchTokenRecord
          scores.set(record.itemId, (scores.get(record.itemId) || 0) + record.weight)
          cursor.continue()
        } else {
          resolve()
        }
      }
      req.onerror = () => reject(req.error)
    })
  }

  return scores
}

async function searchNotes(queryTokens: string[]): Promise<Map<string, number>> {
  const scores = new Map<string, number>()

  const db = await getDb(DB_NAME)
  const records = await new Promise<EncryptedNotesRecord[]>((resolve, reject) => {
    const tx = db.transaction(NOTES_STORE, 'readonly')
    const store = tx.objectStore(NOTES_STORE)
    const req = store.getAll()
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })

  for (const record of records) {
    try {
      const tokens = await decryptNotesTokens(record.encryptedTokensB64)
      let matchCount = 0
      for (const qt of queryTokens) {
        if (tokens.some((t) => t.includes(qt))) {
          matchCount++
        }
      }
      if (matchCount > 0) {
        scores.set(record.itemId, matchCount * WEIGHT_NOTES)
      }
    } catch {
      // corrupted entry — skip
    }
  }

  return scores
}

export async function search(query: string): Promise<SearchResult[]> {
  if (!indexKey) throw new Error('Search index not initialized. Call initSearchIndex first.')

  if (!query || query.trim().length === 0) return []

  const queryTokens = tokenize(query)
  if (queryTokens.length === 0) return []

  const merged = new Map<string, number>()

  const plaintextScores = await searchPlaintextTokens(queryTokens)
  for (const [itemId, score] of plaintextScores) {
    merged.set(itemId, score)
  }

  if (query.trim().length > MIN_QUERY_LENGTH_FOR_NOTES) {
    const notesScores = await searchNotes(queryTokens)
    for (const [itemId, score] of notesScores) {
      merged.set(itemId, (merged.get(itemId) || 0) + score)
    }
  }

  const results: SearchResult[] = []
  for (const [itemId, score] of merged) {
    results.push({ itemId, score })
  }

  results.sort((a, b) => b.score - a.score)

  return results
}
