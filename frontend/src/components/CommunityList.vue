<template>
  <div class="community-list-container">
    <!-- Search Bar -->
    <div class="search-bar">
      <svg class="search-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="11" cy="11" r="8"></circle>
        <path d="m21 21-4.35-4.35"></path>
      </svg>
      <input
        v-model="searchQuery"
        type="text"
        placeholder="搜索小区名称..."
        class="search-input"
        @input="handleSearchInput"
      />
      <button 
        v-if="searchQuery" 
        class="clear-btn"
        @click="clearSearch"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    </div>

    <!-- Loading State -->
    <div v-if="isLoading" class="loading-state">
      <svg class="spinner" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"></circle>
      </svg>
      <p>加载中...</p>
    </div>

    <!-- Empty State -->
    <div v-else-if="communities.length === 0" class="empty-state">
      <svg class="empty-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
        <polyline points="9 22 9 12 15 12 15 22"></polyline>
      </svg>
      <p class="empty-text">{{ searchQuery ? '未找到匹配的小区' : '暂无小区数据' }}</p>
    </div>

    <!-- Community List -->
    <div v-else class="community-list">
      <div
        v-for="community in communities"
        :key="community.id"
        :class="['community-item', { 'selected': isSelected(community.id) }]"
        @click="toggleSelection(community.id)"
      >
        <div class="checkbox-wrapper">
          <input
            type="checkbox"
            :checked="isSelected(community.id)"
            @click.stop="toggleSelection(community.id)"
            class="community-checkbox"
          />
        </div>
        
        <div class="community-info">
          <div class="community-header">
            <h4 class="community-name">{{ community.name }}</h4>
            <span class="community-id">ID: {{ community.id }}</span>
          </div>
          
          <div class="community-details">
            <span class="detail-item">
              <svg class="detail-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
              </svg>
              {{ community.property_count }} 套房源
            </span>
            
            <span v-if="community.district" class="detail-item">
              <svg class="detail-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                <circle cx="12" cy="10" r="3"></circle>
              </svg>
              {{ community.district }}
            </span>
            
            <span v-if="community.avg_price_wan" class="detail-item">
              <svg class="detail-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="12" y1="1" x2="12" y2="23"></line>
                <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
              </svg>
              均价 {{ community.avg_price_wan }} 万
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- Pagination -->
    <div v-if="total > pageSize && !isLoading" class="pagination">
      <button
        class="pagination-btn"
        :disabled="currentPage === 1"
        @click="goToPage(currentPage - 1)"
      >
        上一页
      </button>
      
      <span class="pagination-info">
        第 {{ currentPage }} / {{ totalPages }} 页 (共 {{ total }} 条)
      </span>
      
      <button
        class="pagination-btn"
        :disabled="currentPage === totalPages"
        @click="goToPage(currentPage + 1)"
      >
        下一页
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { fetchCommunities } from '@/api/community'
import { useToast } from '@/composables/useToast'
import type { Community } from '@/api/types'

const { showErrorToast } = useToast()

// Props
const props = defineProps<{
  selectedIds: number[]
}>()

// Emits
const emit = defineEmits<{
  'update:selectedIds': [ids: number[]]
  'communities-loaded': [communities: Community[]]
}>()

// State
const searchQuery = ref('')
const communities = ref<Community[]>([])
const isLoading = ref(false)
const currentPage = ref(1)
const pageSize = ref(50)
const total = ref(0)

// Computed
const totalPages = computed(() => Math.ceil(total.value / pageSize.value))

// Methods
const isSelected = (id: number) => {
  return props.selectedIds.includes(id)
}

const toggleSelection = (id: number) => {
  const newSelection = isSelected(id)
    ? props.selectedIds.filter(selectedId => selectedId !== id)
    : [...props.selectedIds, id]
  
  emit('update:selectedIds', newSelection)
}

const loadCommunities = async () => {
  isLoading.value = true
  try {
    const response = await fetchCommunities(
      searchQuery.value || undefined,
      currentPage.value,
      pageSize.value
    )
    communities.value = response.items
    total.value = response.total
    
    // Emit communities loaded event
    emit('communities-loaded', response.items)
  } catch (error) {
    showErrorToast('加载小区列表失败')
    communities.value = []
    total.value = 0
  } finally {
    isLoading.value = false
  }
}

let searchTimeout: ReturnType<typeof setTimeout> | null = null

const handleSearchInput = () => {
  // Debounce search
  if (searchTimeout) {
    clearTimeout(searchTimeout)
  }
  
  searchTimeout = setTimeout(() => {
    currentPage.value = 1
    loadCommunities()
  }, 300)
}

const clearSearch = () => {
  searchQuery.value = ''
  currentPage.value = 1
  loadCommunities()
}

const goToPage = (page: number) => {
  if (page >= 1 && page <= totalPages.value) {
    currentPage.value = page
    loadCommunities()
  }
}

// Watch for external refresh requests
const refresh = () => {
  loadCommunities()
}

// Expose refresh method
defineExpose({
  refresh
})

// Load initial data
loadCommunities()
</script>

<style scoped>
.community-list-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  background-color: white;
  border-radius: 0.75rem;
  box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1);
  overflow: hidden;
}

/* Search Bar */
.search-bar {
  position: relative;
  padding: 1rem;
  border-bottom: 1px solid #e5e7eb;
}

.search-icon {
  position: absolute;
  left: 1.75rem;
  top: 50%;
  transform: translateY(-50%);
  width: 1.25rem;
  height: 1.25rem;
  color: #9ca3af;
  pointer-events: none;
}

.search-input {
  width: 100%;
  padding: 0.625rem 2.5rem 0.625rem 2.75rem;
  border: 1px solid #d1d5db;
  border-radius: 0.5rem;
  font-size: 0.875rem;
  transition: all 0.2s ease;
}

.search-input:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.clear-btn {
  position: absolute;
  right: 1.75rem;
  top: 50%;
  transform: translateY(-50%);
  width: 1.25rem;
  height: 1.25rem;
  padding: 0;
  border: none;
  background: none;
  color: #9ca3af;
  cursor: pointer;
  transition: color 0.2s ease;
}

.clear-btn:hover {
  color: #6b7280;
}

.clear-btn svg {
  width: 100%;
  height: 100%;
}

/* Loading State */
.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 3rem 1rem;
  color: #6b7280;
}

.spinner {
  width: 2.5rem;
  height: 2.5rem;
  color: #3b82f6;
  animation: spin 1s linear infinite;
  margin-bottom: 1rem;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

/* Empty State */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 3rem 1rem;
  color: #9ca3af;
}

.empty-icon {
  width: 3rem;
  height: 3rem;
  margin-bottom: 1rem;
}

.empty-text {
  font-size: 0.875rem;
  margin: 0;
}

/* Community List */
.community-list {
  flex: 1;
  overflow-y: auto;
  padding: 0.5rem;
}

.community-item {
  display: flex;
  gap: 1rem;
  padding: 1rem;
  border: 2px solid #e5e7eb;
  border-radius: 0.5rem;
  margin-bottom: 0.5rem;
  cursor: pointer;
  transition: all 0.2s ease;
}

.community-item:hover {
  border-color: #3b82f6;
  background-color: #eff6ff;
}

.community-item.selected {
  border-color: #3b82f6;
  background-color: #dbeafe;
}

.checkbox-wrapper {
  display: flex;
  align-items: flex-start;
  padding-top: 0.25rem;
}

.community-checkbox {
  width: 1.25rem;
  height: 1.25rem;
  cursor: pointer;
  accent-color: #3b82f6;
}

.community-info {
  flex: 1;
  min-width: 0;
}

.community-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 0.5rem;
}

.community-name {
  font-size: 1rem;
  font-weight: 600;
  color: #111827;
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.community-id {
  font-size: 0.75rem;
  color: #6b7280;
  background-color: #f3f4f6;
  padding: 0.125rem 0.5rem;
  border-radius: 0.25rem;
  flex-shrink: 0;
}

.community-details {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
}

.detail-item {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.75rem;
  color: #6b7280;
}

.detail-icon {
  width: 0.875rem;
  height: 0.875rem;
  flex-shrink: 0;
}

/* Pagination */
.pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem;
  border-top: 1px solid #e5e7eb;
  background-color: #f9fafb;
}

.pagination-btn {
  padding: 0.5rem 1rem;
  background-color: white;
  color: #374151;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.pagination-btn:hover:not(:disabled) {
  background-color: #f9fafb;
  border-color: #3b82f6;
  color: #3b82f6;
}

.pagination-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.pagination-info {
  font-size: 0.875rem;
  color: #6b7280;
}

/* Scrollbar Styling */
.community-list::-webkit-scrollbar {
  width: 0.5rem;
}

.community-list::-webkit-scrollbar-track {
  background-color: #f3f4f6;
}

.community-list::-webkit-scrollbar-thumb {
  background-color: #d1d5db;
  border-radius: 0.25rem;
}

.community-list::-webkit-scrollbar-thumb:hover {
  background-color: #9ca3af;
}
</style>
