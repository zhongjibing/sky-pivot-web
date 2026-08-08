/**
 * IndexedDB wrapper for offline storage
 *
 * Databases:
 *  1. sky-pivot-vault  — encrypted vault item cache
 *  2. sky-pivot-search — search token index
 *  3. sky-pivot-rk     — Record Key cache (HKDF encrypted, 7-day TTL)
 *  4. sky-pivot-queue  — offline operation queue
 */

const DB_VERSIONS: Record<string, number> = {
  'sky-pivot-vault': 1,
  'sky-pivot-search': 1,
  'sky-pivot-rk': 1,
  'sky-pivot-queue': 1,
}

function openDatabase(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const version = DB_VERSIONS[name]
    if (version === undefined) {
      reject(new Error(`Unknown database: ${name}`))
      return
    }
    const req = indexedDB.open(name, version)
    req.onupgradeneeded = () => {
      const db = req.result
      switch (name) {
        case 'sky-pivot-vault':
          if (!db.objectStoreNames.contains('items')) {
            db.createObjectStore('items', { keyPath: 'id' })
          }
          break
        case 'sky-pivot-search':
          if (!db.objectStoreNames.contains('tokens')) {
            const store = db.createObjectStore('tokens', { keyPath: 'id', autoIncrement: true })
            store.createIndex('token', 'token', { unique: false })
            store.createIndex('itemId', 'itemId', { unique: false })
          }
          break
        case 'sky-pivot-rk':
          if (!db.objectStoreNames.contains('keys')) {
            const store = db.createObjectStore('keys', { keyPath: 'itemId' })
            store.createIndex('expiresAt', 'expiresAt', { unique: false })
          }
          break
        case 'sky-pivot-queue':
          if (!db.objectStoreNames.contains('ops')) {
            const store = db.createObjectStore('ops', { keyPath: 'id', autoIncrement: true })
            store.createIndex('createdAt', 'createdAt', { unique: false })
          }
          break
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function getDb(name: string): Promise<IDBDatabase> {
  return openDatabase(name)
}

export async function putItem(dbName: string, storeName: string, item: unknown): Promise<void> {
  const db = await getDb(dbName)
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite')
    const store = tx.objectStore(storeName)
    store.put(item)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function getItem<T>(dbName: string, storeName: string, key: string): Promise<T | undefined> {
  const db = await getDb(dbName)
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly')
    const store = tx.objectStore(storeName)
    const req = store.get(key)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function deleteItem(dbName: string, storeName: string, key: string): Promise<void> {
  const db = await getDb(dbName)
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite')
    const store = tx.objectStore(storeName)
    store.delete(key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function clearStore(dbName: string, storeName: string): Promise<void> {
  const db = await getDb(dbName)
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite')
    const store = tx.objectStore(storeName)
    store.clear()
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function closeDatabase(name: string): Promise<void> {
  const db = await getDb(name)
  db.close()
}

export async function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(name)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}
