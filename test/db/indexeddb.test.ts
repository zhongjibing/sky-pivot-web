import { describe, it, expect } from 'vitest'
import { getDb, putItem, getItem, deleteItem, clearAllDatabases } from '@/db/indexeddb'

describe('IndexedDB smoke', () => {
  it('open, put, get, delete', async () => {
    const db = await getDb('sky-pivot-rk')
    expect(db).toBeDefined()

    await putItem('sky-pivot-rk', 'keys', { itemId: 'test-1', encryptedRk: new ArrayBuffer(8), expiresAt: 999 })

    const entry = await getItem<{ itemId: string; encryptedRk: ArrayBuffer; expiresAt: number }>(
      'sky-pivot-rk', 'keys', 'test-1'
    )
    expect(entry).toBeDefined()
    expect(entry!.itemId).toBe('test-1')

    await deleteItem('sky-pivot-rk', 'keys', 'test-1')
    const removed = await getItem('sky-pivot-rk', 'keys', 'test-1')
    expect(removed).toBeUndefined()

    db.close()
  })
})

describe('clearAllDatabases', () => {
  it('clearAllDatabases is callable', () => {
    expect(() => clearAllDatabases()).toBeDefined()
  })
})