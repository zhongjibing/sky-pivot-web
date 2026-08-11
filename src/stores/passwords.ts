import { defineStore } from 'pinia'
import { ref } from 'vue'
import {
  listVaultItems,
  getVaultItem,
  createVaultItem,
  updateVaultItem,
  softDeleteVaultItem,
  listTrashItems,
  restoreTrashItem,
  permanentDeleteTrashItem,
} from '@/api/vault'
import type {
  VaultItemRaw,
  VaultListResponse,
} from '@/api/vault'
import { decryptBlob, decryptBlobsBatch, encryptBlob, computeHealth } from '@/crypto/vault-blob'
import type { DecryptedVaultItem } from '@/crypto/vault'
import { buildFullIndex, indexItem, deleteSearchItem, search as searchIndex } from '@/crypto/search'
import { ElMessage } from 'element-plus'

export const usePasswordsStore = defineStore('passwords', () => {
  const list = ref<PasswordItem[]>([])
  const total = ref(0)
  const page = ref(0)
  const size = ref(20)
  const search = ref('')
  const sortBy = ref('updated_at')
  const order = ref('desc')
  const loading = ref(false)
  const syncVersion = ref(0)

  const itemVersions = new Map<string, number>()
  const itemUpdatedAts = new Map<string, string>()
  const decryptedCache = new Map<string, DecryptedVaultItem>()

  function matchSearch(item: DecryptedVaultItem, query: string): boolean {
    if (!query) return true
    const q = query.toLowerCase()
    return (
      item.title.toLowerCase().includes(q) ||
      item.account.toLowerCase().includes(q) ||
      item.url.toLowerCase().includes(q)
    )
  }

  function sortItems(items: DecryptedVaultItem[]): DecryptedVaultItem[] {
    const sorted = [...items]
    sorted.sort((a, b) => {
      const aTime = itemUpdatedAts.get(a.id) || ''
      const bTime = itemUpdatedAts.get(b.id) || ''
      let cmp = 0
      switch (sortBy.value) {
        case 'updated_at':
          cmp = aTime.localeCompare(bTime)
          break
        case 'title':
          cmp = a.title.localeCompare(b.title)
          break
        case 'created_at':
          cmp = (itemUpdatedAts.get(a.id) || '').localeCompare(itemUpdatedAts.get(b.id) || '')
          break
        default:
          cmp = aTime.localeCompare(bTime)
      }
      return order.value === 'desc' ? -cmp : cmp
    })
    return sorted
  }

  function toPasswordItem(item: DecryptedVaultItem): PasswordItem {
    const health = computeHealth(item.password)
    return {
      id: item.id,
      title: item.title,
      account: item.account,
      url: item.url,
      healthLevel: health.healthLevel,
      updatedAt: itemUpdatedAts.get(item.id) || '',
    }
  }

  async function fetchList() {
    loading.value = true
    try {
      const resp: VaultListResponse = await listVaultItems()
      const items = resp.items || []
      syncVersion.value = resp.syncVersion || 0

      for (const raw of items) {
        itemVersions.set(raw.itemId, raw.version)
        itemUpdatedAts.set(raw.itemId, raw.updatedAt || '')
      }

      const allDecrypted = await decryptBlobsBatch(
        items.map((raw) => ({
          itemId: raw.itemId,
          encryptedBlob: raw.encryptedBlob,
          version: raw.version,
        })),
      )

      decryptedCache.clear()
      for (const item of allDecrypted) {
        decryptedCache.set(item.id, item)
      }

      buildFullIndex(allDecrypted).catch(() => {})

      fetchFiltered()
    } catch {
      list.value = []
      total.value = 0
    } finally {
      loading.value = false
    }
  }

  async function fetchFiltered() {
    loading.value = true
    try {
      let filtered: DecryptedVaultItem[]

      if (search.value && search.value.trim()) {
        try {
          const results = await searchIndex(search.value)
          if (results.length > 0) {
            const resultMap = new Map(results.map((r) => [r.itemId, r.score]))
            filtered = [...decryptedCache.values()].filter((item) => resultMap.has(item.id))
            filtered.sort((a, b) => (resultMap.get(b.id) || 0) - (resultMap.get(a.id) || 0))
          } else {
            filtered = [...decryptedCache.values()].filter((item) => matchSearch(item, search.value))
            filtered = sortItems(filtered)
          }
        } catch {
          filtered = [...decryptedCache.values()].filter((item) => matchSearch(item, search.value))
          filtered = sortItems(filtered)
        }
      } else {
        filtered = [...decryptedCache.values()]
        filtered = sortItems(filtered)
      }

      total.value = filtered.length
      const start = page.value * size.value
      const paged = filtered.slice(start, start + size.value)

      list.value = paged.map(toPasswordItem)
    } catch {
      list.value = []
      total.value = 0
    } finally {
      loading.value = false
    }
  }

  function setSearch(val: string) {
    search.value = val
    page.value = 0
    fetchFiltered()
  }

  function setSort(field: string, dir: string) {
    sortBy.value = field
    order.value = dir
    fetchFiltered()
  }

  function setPage(p: number) {
    page.value = p
    fetchFiltered()
  }

  async function create(data: { title: string; url?: string; account: string; password: string; notes?: string }) {
    const itemId = crypto.randomUUID()
    const item: DecryptedVaultItem = {
      id: itemId,
      title: data.title,
      url: data.url || '',
      account: data.account,
      password: data.password,
      notes: data.notes || '',
      syncVersion: 0,
    }

    const result = await encryptBlob(item)
    if (!result) {
      ElMessage.error('Encryption failed')
      throw new Error('Failed to encrypt password')
    }

    try {
      await createVaultItem({ itemId, encryptedBlob: result.encryptedBlob })
      decryptedCache.set(itemId, item)
      indexItem(item).catch(() => {})
      ElMessage.success('Password created successfully')
      fetchFiltered()
      return { id: itemId, healthScore: computeHealth(data.password).healthScore, healthLevel: computeHealth(data.password).healthLevel }
    } catch {
      ElMessage.error('Failed to create password')
      throw new Error('Failed to create password')
    }
  }

  async function getDetail(itemId: string): Promise<PasswordDetail | null> {
    try {
      const raw: VaultItemRaw = await getVaultItem(itemId)
      itemVersions.set(raw.itemId, raw.version)
      itemUpdatedAts.set(raw.itemId, raw.updatedAt || '')

      const decrypted = await decryptBlob(raw.encryptedBlob, raw.itemId, raw.version)
      if (!decrypted) {
        ElMessage.error('Failed to decrypt password')
        return null
      }

      const health = computeHealth(decrypted.password)
      return {
        id: decrypted.id,
        title: decrypted.title,
        url: decrypted.url,
        account: decrypted.account,
        password: decrypted.password,
        notes: decrypted.notes,
        healthScore: health.healthScore,
        healthLevel: health.healthLevel,
      }
    } catch {
      ElMessage.error('Failed to load password detail')
      return null
    }
  }

  async function update(id: string, data: { url?: string; account: string; password: string; notes?: string }) {
    const raw: VaultItemRaw = await getVaultItem(id)
    const decrypted = await decryptBlob(raw.encryptedBlob, raw.itemId, raw.version)
    if (!decrypted) {
      ElMessage.error('Failed to decrypt password for update')
      throw new Error('Failed to decrypt password')
    }

    const version = raw.version

    const updated: DecryptedVaultItem = {
      id,
      title: decrypted.title,
      url: data.url || '',
      account: data.account,
      password: data.password,
      notes: data.notes || '',
      syncVersion: version,
    }

    const result = await encryptBlob(updated)
    if (!result) {
      ElMessage.error('Encryption failed')
      throw new Error('Failed to encrypt password')
    }

    try {
      await updateVaultItem(id, { encryptedBlob: result.encryptedBlob, version })
      decryptedCache.set(id, updated)
      indexItem(updated).catch(() => {})
      ElMessage.success('Password updated successfully')
      fetchFiltered()
    } catch {
      ElMessage.error('Failed to update password')
      throw new Error('Failed to update password')
    }
  }

  async function remove(id: string) {
    try {
      await softDeleteVaultItem(id)
      decryptedCache.delete(id)
      deleteSearchItem(id).catch(() => {})
      ElMessage.success('Password moved to trash')
      fetchFiltered()
    } catch {
      ElMessage.error('Failed to delete password')
      throw new Error('Failed to delete password')
    }
  }

  async function fetchTrash(): Promise<TrashItem[]> {
    try {
      const items = await listTrashItems()
      const trashItems: TrashItem[] = []
      for (const raw of items) {
        const decrypted = await decryptBlob(raw.encryptedBlob, raw.itemId, raw.version)
        if (decrypted) {
          const deletedAt = raw.updatedAt || ''
          const deletedDate = new Date(deletedAt)
          const now = new Date()
          const diffDays = Math.max(0, 30 - Math.floor((now.getTime() - deletedDate.getTime()) / 86400000))
          trashItems.push({
            id: decrypted.id,
            title: decrypted.title,
            account: decrypted.account,
            deletedAt,
            daysRemaining: diffDays,
          })
        }
      }
      return trashItems
    } catch {
      return []
    }
  }

  async function restore(id: string) {
    try {
      await restoreTrashItem(id)
      ElMessage.success('Password restored successfully')
    } catch {
      ElMessage.error('Failed to restore password')
      throw new Error('Failed to restore password')
    }
  }

  async function permanentDelete(id: string) {
    try {
      await permanentDeleteTrashItem(id)
      ElMessage.success('Password permanently deleted')
    } catch {
      ElMessage.error('Failed to permanently delete password')
      throw new Error('Failed to permanently delete password')
    }
  }

  async function getHealthSummary(): Promise<HealthSummary> {
    try {
      const resp: VaultListResponse = await listVaultItems()
      const allDecrypted = await decryptBlobsBatch(
        resp.items.map((raw) => ({
          itemId: raw.itemId,
          encryptedBlob: raw.encryptedBlob,
          version: raw.version,
        })),
      )

      const summary: HealthSummary = { weak: 0, fair: 0, strong: 0, veryStrong: 0 }
      for (const item of allDecrypted) {
        const health = computeHealth(item.password)
        if (health.healthLevel === 'weak') summary.weak++
        else if (health.healthLevel === 'fair') summary.fair++
        else if (health.healthLevel === 'strong') summary.strong++
        else if (health.healthLevel === 'verystrong') summary.veryStrong++
      }
      return summary
    } catch {
      return { weak: 0, fair: 0, strong: 0, veryStrong: 0 }
    }
  }

  async function getWeakPasswords(): Promise<PasswordItem[]> {
    try {
      const resp: VaultListResponse = await listVaultItems()
      const allDecrypted = await decryptBlobsBatch(
        resp.items.map((raw) => ({
          itemId: raw.itemId,
          encryptedBlob: raw.encryptedBlob,
          version: raw.version,
        })),
      )
      return allDecrypted
        .filter((item) => {
          const health = computeHealth(item.password)
          return health.healthLevel === 'weak'
        })
        .map(toPasswordItem)
    } catch {
      return []
    }
  }

  return {
    list,
    total,
    page,
    size,
    search,
    sortBy,
    order,
    loading,
    syncVersion,
    fetchList,
    fetchFiltered,
    setSearch,
    setSort,
    setPage,
    create,
    getDetail,
    update,
    remove,
    fetchTrash,
    restore,
    permanentDelete,
    getHealthSummary,
    getWeakPasswords,
  }
})
