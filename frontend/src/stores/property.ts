import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { PropertyFilters } from '@/api/types'

export const usePropertyStore = defineStore('property', () => {
  // State
  const filters = ref<PropertyFilters>({
    status: null,
    community_name: '',
    min_price: 0,
    max_price: 20000,
    min_area: 0,
    max_area: 300,
    rooms: [],
    sort_by: 'updated_at',
    sort_order: 'desc',
    page: 1,
    page_size: 50
  })
  
  // Actions
  const updateFilter = <K extends keyof PropertyFilters>(
    key: K,
    value: PropertyFilters[K]
  ) => {
    filters.value[key] = value
    // Reset to first page when filters change
    if (key !== 'page' && key !== 'page_size') {
      filters.value.page = 1
    }
  }
  
  const toggleSort = (key: string) => {
    if (filters.value.sort_by === key) {
      filters.value.sort_order = filters.value.sort_order === 'asc' ? 'desc' : 'asc'
    } else {
      filters.value.sort_by = key
      filters.value.sort_order = 'asc'
    }
    filters.value.page = 1
  }
  
  const resetFilters = () => {
    filters.value = {
      status: null,
      community_name: '',
      min_price: 0,
      max_price: 20000,
      min_area: 0,
      max_area: 300,
      rooms: [],
      sort_by: 'updated_at',
      sort_order: 'desc',
      page: 1,
      page_size: 50
    }
  }
  
  const setPage = (page: number) => {
    filters.value.page = page
  }
  
  const setPageSize = (pageSize: number) => {
    filters.value.page_size = pageSize
    filters.value.page = 1
  }
  
  return {
    filters,
    updateFilter,
    toggleSort,
    resetFilters,
    setPage,
    setPageSize
  }
})
