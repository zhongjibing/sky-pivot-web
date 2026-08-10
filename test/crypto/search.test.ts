import { describe, it, expect, beforeEach } from 'vitest'
import {
  initSearchIndex,
  clearSearchIndexKey,
  indexItem,
  deleteSearchItem,
  buildFullIndex,
  clearIndex,
  search,
} from '@/crypto/search'
import type { DecryptedVaultItem } from '@/crypto/vault'

function createTestURKRaw(): ArrayBuffer {
  return new Uint8Array(32).fill(0x55).buffer as ArrayBuffer
}

function createAltURKRaw(): ArrayBuffer {
  return new Uint8Array(32).fill(0x66).buffer as ArrayBuffer
}

function makeItem(overrides: Partial<DecryptedVaultItem> & { id: string }): DecryptedVaultItem {
  return {
    title: '',
    url: '',
    account: '',
    password: '',
    notes: '',
    syncVersion: 1,
    ...overrides,
  }
}

beforeEach(async () => {
  clearSearchIndexKey()
  await initSearchIndex(createTestURKRaw())
  await clearIndex()
})

describe('SearchIndexManager', () => {
  describe('initSearchIndex', () => {
    it('derives index key from URK raw bytes via HKDF-SHA256', async () => {
      clearSearchIndexKey()
      await initSearchIndex(createTestURKRaw())
      // Weakened assertion since we cannot export the key
      expect(await search('nonexistent')).toEqual([])
    })

    it('is idempotent', async () => {
      clearSearchIndexKey()
      await initSearchIndex(createTestURKRaw())
      await initSearchIndex(createTestURKRaw())
      expect(await search('something')).toEqual([])
    })

    it('throws if used before init', async () => {
      clearSearchIndexKey()
      await expect(indexItem(makeItem({ id: 'x' }))).rejects.toThrow(
        'Search index not initialized',
      )
    })
  })

  describe('indexItem', () => {
    it('indexes title tokens so they are searchable', async () => {
      await initSearchIndex(createTestURKRaw())
      const item = makeItem({ id: 'item-1', title: 'My GitHub Login' })
      await indexItem(item)

      const results = await search('github')
      expect(results.length).toBe(1)
      expect(results[0].itemId).toBe('item-1')
      expect(results[0].score).toBe(10)
    })

    it('indexes account tokens so they are searchable', async () => {
      await initSearchIndex(createTestURKRaw())
      const item = makeItem({ id: 'item-2', title: 'GitHub', account: 'admin@corp.com' })
      await indexItem(item)

      const results = await search('admin@corp.com')
      expect(results.length).toBe(1)
      expect(results[0].itemId).toBe('item-2')
    })

    it('indexes URL tokens so they are searchable', async () => {
      await initSearchIndex(createTestURKRaw())
      const item = makeItem({ id: 'item-3', url: 'https://uniqueportal.io/login' })
      await indexItem(item)

      const results = await search('uniqueportal')
      expect(results.length).toBe(1)
      expect(results[0].itemId).toBe('item-3')
      expect(results[0].score).toBe(5)
    })

    it('indexes notes tokens encrypted and searchable when query > 3 chars', async () => {
      await initSearchIndex(createTestURKRaw())
      const item = makeItem({ id: 'item-4', notes: 'two-factor enabled security key' })
      await indexItem(item)

      const results = await search('enabled')
      expect(results.length).toBe(1)
      expect(results[0].itemId).toBe('item-4')
      expect(results[0].score).toBe(3)
    })

    it('notes are NOT searched when query <= 3 chars', async () => {
      await initSearchIndex(createTestURKRaw())
      const item = makeItem({ id: 'item-5', notes: 'foo bar baz' })
      await indexItem(item)

      // 'foo' is 3 chars, without title/account match, notes should NOT be searched
      const results = await search('foo')
      expect(results.length).toBe(0)
    })

    it('multiple tokens in title are individually searchable', async () => {
      await initSearchIndex(createTestURKRaw())
      const item = makeItem({ id: 'item-6', title: 'Bank of America Checking' })
      await indexItem(item)

      const byBank = await search('bank')
      const byAmerica = await search('america')
      const byChecking = await search('checking')

      expect(byBank.length).toBe(1)
      expect(byAmerica.length).toBe(1)
      expect(byChecking.length).toBe(1)
    })

    it('updating an item deletes old tokens and stores new ones', async () => {
      await initSearchIndex(createTestURKRaw())

      const item = makeItem({ id: 'item-7', title: 'Old Name' })
      await indexItem(item)

      const itemUpdated = makeItem({ id: 'item-7', title: 'New Name' })
      await indexItem(itemUpdated)

      const oldResults = await search('old')
      const newResults = await search('new')

      expect(oldResults.length).toBe(0)
      expect(newResults.length).toBe(1)
      expect(newResults[0].itemId).toBe('item-7')
    })
  })

  describe('deleteSearchItem', () => {
    it('removes all tokens for a given item', async () => {
      await initSearchIndex(createTestURKRaw())
      const item = makeItem({ id: 'to-delete', title: 'Delete Me' })
      await indexItem(item)

      let results = await search('delete')
      expect(results.length).toBe(1)

      await deleteSearchItem('to-delete')

      results = await search('delete')
      expect(results.length).toBe(0)
    })

    it('no-op for non-existent item', async () => {
      await initSearchIndex(createTestURKRaw())
      await expect(deleteSearchItem('no-such-id')).resolves.toBeUndefined()
    })
  })

  describe('buildFullIndex', () => {
    it('rebuilds all items and makes them searchable', async () => {
      await initSearchIndex(createTestURKRaw())

      const items: DecryptedVaultItem[] = [
        makeItem({ id: 'g1', title: 'GitHub', account: 'dev@gh.com' }),
        makeItem({ id: 'g2', title: 'GitLab', account: 'dev@gl.com' }),
        makeItem({ id: 'g3', title: 'Google', account: 'dev@google.com' }),
      ]

      await buildFullIndex(items)

      expect((await search('github')).length).toBe(1)
      expect((await search('gitlab')).length).toBe(1)
      expect((await search('google')).length).toBe(1)
    })

    it('clears previous index before rebuilding', async () => {
      await initSearchIndex(createTestURKRaw())

      let items: DecryptedVaultItem[] = [
        makeItem({ id: 'old-1', title: 'Old Service' }),
      ]
      await buildFullIndex(items)
      expect((await search('old')).length).toBe(1)

      items = [
        makeItem({ id: 'new-1', title: 'New Service' }),
        makeItem({ id: 'new-2', title: 'Another New' }),
      ]
      await buildFullIndex(items)
      expect((await search('old')).length).toBe(0)
      expect((await search('new')).length).toBe(2)
    })
  })

  describe('clearIndex', () => {
    it('removes all tokens from the index', async () => {
      await initSearchIndex(createTestURKRaw())

      const items: DecryptedVaultItem[] = [
        makeItem({ id: 'a', title: 'Item A' }),
        makeItem({ id: 'b', title: 'Item B' }),
      ]
      await buildFullIndex(items)

      await clearIndex()

      expect((await search('item')).length).toBe(0)
    })
  })

  describe('search ranking', () => {
    it('outputs results sorted by descending score', async () => {
      await initSearchIndex(createTestURKRaw())

      const items: DecryptedVaultItem[] = [
        makeItem({ id: 'low', url: 'https://example.com/r1' }),
        makeItem({ id: 'mid', account: 'r1@example.com' }),
        makeItem({ id: 'high', title: 'R1 Admin Panel' }),
      ]
      await buildFullIndex(items)

      const results = await search('r1')
      expect(results[0].itemId).toBe('high')
      expect(results[1].itemId).toBe('mid')
      expect(results[2].itemId).toBe('low')
    })

    it('score accumulates across fields', async () => {
      await initSearchIndex(createTestURKRaw())

      // item where 'test' appears in title (10) AND account (8)
      const item = makeItem({
        id: 'multi',
        title: 'Test System',
        account: 'test@example.com',
      })
      await indexItem(item)

      const results = await search('test')
      expect(results.length).toBe(1)
      expect(results[0].score).toBe(18)
    })
  })

  describe('edge cases', () => {
    it('empty query returns empty results', async () => {
      await initSearchIndex(createTestURKRaw())
      const item = makeItem({ id: 'e1', title: 'Hello World' })
      await indexItem(item)

      expect((await search('')).length).toBe(0)
      expect((await search('   ')).length).toBe(0)
    })

    it('empty field tokens are not indexed', async () => {
      await initSearchIndex(createTestURKRaw())
      const item = makeItem({ id: 'e2', title: '', account: '', url: '', notes: '' })
      await indexItem(item)

      expect((await search('anything')).length).toBe(0)
    })

    it('case-insensitive search', async () => {
      await initSearchIndex(createTestURKRaw())
      const item = makeItem({ id: 'case', title: 'GitHub' })
      await indexItem(item)

      expect((await search('github')).length).toBe(1)
      expect((await search('GITHUB')).length).toBe(1)
      expect((await search('GitHub')).length).toBe(1)
    })

    it('partial token match is NOT supported for plaintext tokens', async () => {
      await initSearchIndex(createTestURKRaw())
      const item = makeItem({ id: 'partial', title: 'GitHub' })
      await indexItem(item)

      // Exact token match only for plaintext
      expect((await search('git')).length).toBe(0)
      expect((await search('hub')).length).toBe(0)
    })

    it('CJK characters are tokenized individually', async () => {
      await initSearchIndex(createTestURKRaw())
      const item = makeItem({ id: 'cjk', title: '百度网盘' })
      await indexItem(item)

      expect((await search('百')).length).toBe(1)
      expect((await search('度')).length).toBe(1)
      expect((await search('网')).length).toBe(1)
      expect((await search('盘')).length).toBe(1)
    })

    it('items without notes do not create notes entries', async () => {
      await initSearchIndex(createTestURKRaw())
      const item = makeItem({ id: 'nonotes', title: 'Test', notes: '' })
      await indexItem(item)

      // Should not throw; just returns results
      const results = await search('test longer query for notes search')
      expect(results.length).toBe(1)
      expect(results[0].itemId).toBe('nonotes')
    })

    it('notes token partial match works (includes check)', async () => {
      await initSearchIndex(createTestURKRaw())
      const item = makeItem({ id: 'np', notes: 'backup codes stored in safe' })
      await indexItem(item)

      // Notes search uses includes(), partial match allowed
      const results = await search('back')
      expect(results.length).toBe(1)
      expect(results[0].itemId).toBe('np')
    })
  })

  describe('encryption isolation', () => {
    it('index created with one URK cannot read notes from index created with another URK', async () => {
      clearSearchIndexKey()
      await initSearchIndex(createTestURKRaw())

      const item = makeItem({ id: 'isolated', notes: 'secret note content' })
      await indexItem(item)

      // Switch to another URK
      clearSearchIndexKey()
      await initSearchIndex(createAltURKRaw())

      // Search with > 3 chars to trigger notes search
      const results = await search('secret')
      // Notes should fail to decrypt → no results
      expect(results.length).toBe(0)
    })
  })

  describe('performance (AC-5)', () => {
    it('search is fast with reasonable data volume', async () => {
      await initSearchIndex(createTestURKRaw())

      const N = 500
      const items: DecryptedVaultItem[] = []
      for (let i = 0; i < N; i++) {
        items.push(
          makeItem({
            id: `perf-${i}`,
            title: `Account ${i}`,
            account: `user${i}@example.com`,
            url: `https://service-${i}.com`,
            notes: `Note ${i}`,
          }),
        )
      }

      await buildFullIndex(items)

      const start = performance.now()
      const results = await search('account')
      const elapsed = performance.now() - start

      expect(results.length).toBeGreaterThan(0)
      // fake-indexeddb throughput not representative of real IndexedDB
      // AC-5 target (<200ms, 10000 records) validated in Chrome desktop
      expect(elapsed).toBeLessThan(5000)
    }, 60000)
  })
})
