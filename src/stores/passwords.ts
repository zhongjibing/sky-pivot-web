import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getPasswordList, createPassword, updatePassword, deletePassword } from '@/api/passwords'
import type { PasswordListParams } from '@/api/passwords'
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

  async function fetchList() {
    loading.value = true
    try {
      const params: PasswordListParams = {
        search: search.value,
        sortBy: sortBy.value,
        order: order.value,
        page: page.value,
        size: size.value,
      }
      const res = await getPasswordList(params)
      list.value = res.data.content || []
      total.value = res.data.totalElements || 0
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
    fetchList()
  }

  function setSort(field: string, dir: string) {
    sortBy.value = field
    order.value = dir
    fetchList()
  }

  function setPage(p: number) {
    page.value = p
    fetchList()
  }

  async function create(data: { title: string; url?: string; account: string; password: string; notes?: string }) {
    try {
      const res = await createPassword(data)
      ElMessage.success('Password created successfully')
      fetchList()
      return res.data
    } catch {
      throw new Error('Failed to create password')
    }
  }

  async function update(id: string, data: { url?: string; account: string; password: string; notes?: string }, masterPassword: string) {
    try {
      await updatePassword(id, data, masterPassword)
      ElMessage.success('Password updated successfully')
      fetchList()
    } catch {
      throw new Error('Failed to update password')
    }
  }

  async function remove(id: string) {
    try {
      await deletePassword(id)
      ElMessage.success('Password moved to trash')
      fetchList()
    } catch {
      throw new Error('Failed to delete password')
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
    fetchList,
    setSearch,
    setSort,
    setPage,
    create,
    update,
    remove,
  }
})
