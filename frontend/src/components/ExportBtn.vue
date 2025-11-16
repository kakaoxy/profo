<template>
  <button
    :class="['export-btn', { 'exporting': isExporting, 'disabled': isExporting }]"
    :disabled="isExporting"
    @click="handleExport"
  >
    <span v-if="!isExporting" class="btn-content">
      <svg class="icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
        <polyline points="7 10 12 15 17 10"></polyline>
        <line x1="12" y1="15" x2="12" y2="3"></line>
      </svg>
      导出 CSV
    </span>
    <span v-else class="btn-content">
      <svg class="icon spinner" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"></circle>
      </svg>
      导出中...
    </span>
  </button>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { usePropertyStore } from '@/stores/property'
import { exportProperties } from '@/api/properties'
import { useToast } from '@/composables/useToast'

const propertyStore = usePropertyStore()
const { showSuccessToast } = useToast()

const isExporting = ref(false)

const handleExport = async () => {
  if (isExporting.value) return
  
  isExporting.value = true
  
  try {
    // Get current filters from store (excluding pagination)
    const filters = {
      status: propertyStore.filters.status,
      community_name: propertyStore.filters.community_name,
      min_price: propertyStore.filters.min_price,
      max_price: propertyStore.filters.max_price,
      min_area: propertyStore.filters.min_area,
      max_area: propertyStore.filters.max_area,
      rooms: propertyStore.filters.rooms,
      sort_by: propertyStore.filters.sort_by,
      sort_order: propertyStore.filters.sort_order
    }
    
    // Call export API
    await exportProperties(filters)
    
    // Show success message
    showSuccessToast('导出成功！文件已开始下载')
  } catch (error) {
    // Error is already handled by axios interceptor
    // But we can add additional context here if needed
    console.error('Export failed:', error)
  } finally {
    isExporting.value = false
  }
}
</script>

<style scoped>
.export-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.625rem 1.25rem;
  background-color: #10b981;
  color: white;
  border: none;
  border-radius: 0.375rem;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
}

.export-btn:hover:not(.disabled) {
  background-color: #059669;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  transform: translateY(-1px);
}

.export-btn:active:not(.disabled) {
  transform: translateY(0);
  box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
}

.export-btn.exporting {
  background-color: #6b7280;
  cursor: not-allowed;
}

.export-btn.disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.btn-content {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.icon {
  width: 1.25rem;
  height: 1.25rem;
}

.spinner {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
