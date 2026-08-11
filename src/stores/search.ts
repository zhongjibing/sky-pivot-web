import { defineStore } from 'pinia'
import { ref } from 'vue'
import { search as searchIndex } from '@/crypto/search'

export interface SearchResult {
  itemId: string
  title: string
  highlightedFragment: string
}

export const useSearchStore = defineStore('search', () => {
  const query = ref('')
  const results = ref<SearchResult[]>([])
  const loading = ref(false)

  async function search(_query: string) {
    query.value = _query
    loading.value = true
    try {
      const searchResults = await searchIndex(_query)
      results.value = searchResults.map((r) => ({
        itemId: r.itemId,
        title: '',
        highlightedFragment: '',
      }))
    } finally {
      loading.value = false
    }
  }

  function clearSearch() {
    query.value = ''
    results.value = []
  }

  return {
    query,
    results,
    loading,
    search,
    clearSearch,
  }
})
