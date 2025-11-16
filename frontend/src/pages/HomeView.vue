<template>
  <div class="home-view">
    <!-- Header -->
    <div class="page-header">
      <h1 class="page-title">房源列表</h1>
      <ExportBtn />
    </div>

    <!-- Main Content -->
    <div class="content-container">
      <!-- Left Sidebar - Filters -->
      <aside class="sidebar">
        <FilterPanel />
      </aside>

      <!-- Right Content - Property List -->
      <main class="main-content">
        <!-- Property List -->
        <div class="list-container">
          <PropertyList
            :properties="properties"
            :loading="isLoading"
            @view-detail="handleViewDetail"
          />
        </div>

        <!-- Pagination -->
        <div v-if="!isLoading && properties.length > 0" class="pagination-container">
          <Pagination
            :current-page="currentPage"
            :total="totalCount"
            :page-size="pageSize"
            @update:current-page="handlePageChange"
            @update:page-size="handlePageSizeChange"
          />
        </div>

        <!-- Error State -->
        <div v-if="isError" class="error-state-container">
          <EmptyState
            icon="document"
            title="加载失败"
            description="无法加载房源数据，请检查网络连接后重试"
          >
            <template #action>
              <button class="btn btn-primary" @click="() => refetch()">
                <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                重试
              </button>
            </template>
          </EmptyState>
        </div>
      </main>
    </div>

    <!-- Property Detail Modal -->
    <PropertyDetailModal
      v-model:visible="detailModalVisible"
      :property="selectedProperty"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { usePropertyStore } from '@/stores/property'
import { fetchProperties } from '@/api/properties'
import { useErrorBoundary } from '@/composables/useErrorBoundary'
import FilterPanel from '@/components/FilterPanel.vue'
import PropertyList from '@/components/PropertyList.vue'
import ExportBtn from '@/components/ExportBtn.vue'
import PropertyDetailModal from '@/components/PropertyDetailModal.vue'
import Pagination from '@/components/Pagination.vue'
import EmptyState from '@/components/EmptyState.vue'
import type { Property } from '@/api/types'

// Setup error boundary for this component
useErrorBoundary('房源列表页')

const propertyStore = usePropertyStore()

// State
const detailModalVisible = ref(false)
const selectedProperty = ref<Property | null>(null)

// Computed values from store
const filters = computed(() => propertyStore.filters)
const currentPage = computed(() => propertyStore.filters.page || 1)
const pageSize = computed(() => propertyStore.filters.page_size || 50)

// Use vue-query to manage data fetching with optimized configuration
const {
  data,
  isLoading,
  isError,
  refetch
} = useQuery({
  queryKey: ['properties', filters],
  queryFn: () => fetchProperties(filters.value),
  // Caching strategy is now configured globally in main.ts
  // These local overrides provide fine-tuned control for this specific query
  staleTime: 3 * 60 * 1000, // Consider data fresh for 3 minutes (shorter for property list)
  gcTime: 10 * 60 * 1000, // Keep unused data in cache for 10 minutes
  refetchOnWindowFocus: false,
  // Note: placeholderData replaces keepPreviousData in newer versions of @tanstack/vue-query
  // This helps with memory management for large datasets
})

// Extract data from query result
const properties = computed(() => data.value?.items || [])
const totalCount = computed(() => data.value?.total || 0)

// Event handlers
const handleViewDetail = (property: Property) => {
  selectedProperty.value = property
  detailModalVisible.value = true
}

const handlePageChange = (page: number) => {
  propertyStore.setPage(page)
  // Scroll to top when page changes
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

const handlePageSizeChange = (size: number) => {
  propertyStore.setPageSize(size)
}
</script>

<style scoped>
.home-view {
  width: 100%;
  min-height: 100vh;
  background-color: #f5f5f5;
}

.page-header {
  background: linear-gradient(to bottom, #ffffff, #fafbfc);
  border-bottom: 1px solid #e5e7eb;
  padding: 1.5rem 2rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  position: sticky;
  top: 0;
  z-index: 10;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  backdrop-filter: blur(8px);
}

.page-title {
  font-size: 1.5rem;
  font-weight: 700;
  color: #111827;
  margin: 0;
  letter-spacing: -0.025em;
}

.content-container {
  display: flex;
  gap: 1.5rem;
  padding: 1.5rem 2rem;
  max-width: 1920px;
  margin: 0 auto;
}

.sidebar {
  width: 280px;
  flex-shrink: 0;
  position: sticky;
  top: 100px;
  height: fit-content;
}

.main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  min-width: 0;
}

.list-container {
  background: white;
  border-radius: 0.5rem;
  overflow: hidden;
  min-height: 600px;
  display: flex;
  flex-direction: column;
  box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1);
  transition: box-shadow 0.3s ease;
}

.list-container:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
}

.pagination-container {
  margin-top: 0.5rem;
}

.error-state-container {
  background: white;
  border-radius: 0.5rem;
  box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1);
}

.w-4 {
  width: 1rem;
  height: 1rem;
}

.h-4 {
  width: 1rem;
  height: 1rem;
}

/* Responsive Design */
@media (max-width: 1024px) {
  .content-container {
    flex-direction: column;
  }

  .sidebar {
    width: 100%;
    position: static;
  }
}

@media (max-width: 768px) {
  .page-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 1rem;
  }

  .content-container {
    padding: 1rem;
    gap: 1rem;
  }
}
</style>
