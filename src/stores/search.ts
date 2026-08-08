import { defineStore } from 'pinia'
import { ref } from 'vue'

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
      // IndexedDB search — Phase 2.1.5
      results.value = []
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
