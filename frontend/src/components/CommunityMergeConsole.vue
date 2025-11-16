<template>
  <div class="merge-console-container">
    <div class="console-header">
      <h3 class="console-title">小区合并操作台</h3>
      <p class="console-subtitle">选择主记录并确认合并</p>
    </div>

    <!-- Empty State -->
    <div v-if="selectedCommunities.length === 0" class="empty-state">
      <svg class="empty-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M9 11l3 3L22 4"></path>
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
      </svg>
      <p class="empty-text">请从左侧列表选择小区</p>
      <p class="empty-hint">至少选择 2 个小区才能进行合并操作</p>
    </div>

    <!-- Insufficient Selection -->
    <div v-else-if="selectedCommunities.length === 1" class="warning-state">
      <svg class="warning-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
        <line x1="12" y1="9" x2="12" y2="13"></line>
        <line x1="12" y1="17" x2="12.01" y2="17"></line>
      </svg>
      <p class="warning-text">已选择 1 个小区</p>
      <p class="warning-hint">请至少再选择 1 个小区进行合并</p>
    </div>

    <!-- Selected Communities -->
    <div v-else class="selected-section">
      <div class="selection-info">
        <svg class="info-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="16" x2="12" y2="12"></line>
          <line x1="12" y1="8" x2="12.01" y2="8"></line>
        </svg>
        <div>
          <p class="info-title">已选择 {{ selectedCommunities.length }} 个小区</p>
          <p class="info-subtitle">请选择一个作为主记录，其他小区将合并到主记录中</p>
        </div>
      </div>

      <!-- Selected Communities List -->
      <div class="selected-list">
        <div
          v-for="community in selectedCommunities"
          :key="community.id"
          :class="['selected-item', { 'primary': primaryId === community.id }]"
        >
          <div class="radio-wrapper">
            <input
              type="radio"
              :value="community.id"
              v-model="primaryId"
              :id="`primary-${community.id}`"
              class="primary-radio"
            />
            <label :for="`primary-${community.id}`" class="radio-label">
              主记录
            </label>
          </div>
          
          <div class="item-info">
            <div class="item-header">
              <h4 class="item-name">{{ community.name }}</h4>
              <span class="item-id">ID: {{ community.id }}</span>
            </div>
            
            <div class="item-stats">
              <span class="stat-badge">
                <svg class="stat-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                </svg>
                {{ community.property_count }} 套房源
              </span>
              
              <span v-if="community.district" class="stat-badge">
                <svg class="stat-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                  <circle cx="12" cy="10" r="3"></circle>
                </svg>
                {{ community.district }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- Merge Summary -->
      <div class="merge-summary">
        <div class="summary-item">
          <span class="summary-label">合并后总房源数</span>
          <span class="summary-value">{{ totalProperties }} 套</span>
        </div>
        <div class="summary-item">
          <span class="summary-label">将被合并的小区</span>
          <span class="summary-value">{{ selectedCommunities.length - 1 }} 个</span>
        </div>
      </div>

      <!-- Merge Button -->
      <button
        class="merge-btn"
        :disabled="!primaryId || isMerging"
        @click="handleMerge"
      >
        <svg v-if="!isMerging" class="btn-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
          <line x1="12" y1="9" x2="12" y2="13"></line>
          <line x1="12" y1="17" x2="12.01" y2="17"></line>
        </svg>
        <svg v-else class="btn-icon spinner" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"></circle>
        </svg>
        {{ isMerging ? '合并中...' : '确认合并' }}
      </button>

      <p class="merge-warning">
        ⚠️ 此操作不可撤销，请确认选择正确的主记录
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { mergeCommunities } from '@/api/community'
import { useToast } from '@/composables/useToast'
import { useConfirm } from '@/composables/useConfirm'
import { validateCommunityMerge } from '@/utils/validation'
import type { Community } from '@/api/types'

const { showSuccessToast, showErrorToast } = useToast()
const { showConfirm } = useConfirm()

// Props
const props = defineProps<{
  selectedCommunities: Community[]
}>()

// Emits
const emit = defineEmits<{
  'merge-success': []
}>()

// State
const primaryId = ref<number | null>(null)
const isMerging = ref(false)

// Computed
const totalProperties = computed(() => {
  return props.selectedCommunities.reduce((sum, c) => sum + c.property_count, 0)
})

// Methods
const handleMerge = async () => {
  // Validate merge operation
  const validation = validateCommunityMerge(props.selectedCommunities, primaryId.value)
  if (!validation.valid) {
    return
  }

  // Get merge IDs (all selected except primary)
  const mergeIds = props.selectedCommunities
    .filter(c => c.id !== primaryId.value)
    .map(c => c.id)

  // Get primary community name
  const primaryCommunity = props.selectedCommunities.find(c => c.id === primaryId.value)
  const primaryName = primaryCommunity?.name || ''

  // Show confirmation dialog
  const confirmed = await showConfirm({
    title: '确认合并小区',
    message: `将 ${props.selectedCommunities.length - 1} 个小区合并到「${primaryName}」，共影响 ${totalProperties.value} 套房源。此操作不可撤销，是否继续？`,
    confirmText: '确认合并',
    cancelText: '取消',
    type: 'warning'
  })

  if (!confirmed) {
    return
  }

  // Perform merge
  isMerging.value = true
  try {
    const result = await mergeCommunities(primaryId.value!, mergeIds)
    
    if (result.success) {
      showSuccessToast(`合并成功！共更新 ${result.affected_properties} 套房源`)
      
      // Reset state
      primaryId.value = null
      
      // Emit success event
      emit('merge-success')
    } else {
      showErrorToast(result.message || '合并失败')
    }
  } catch (error) {
    showErrorToast('合并失败，请重试')
  } finally {
    isMerging.value = false
  }
}

// Watch for selection changes and reset primary if it's no longer in selection
watch(() => props.selectedCommunities, (newSelection) => {
  if (primaryId.value && !newSelection.find(c => c.id === primaryId.value)) {
    primaryId.value = null
  }
})
</script>

<style scoped>
.merge-console-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  background-color: white;
  border-radius: 0.75rem;
  box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1);
  overflow: hidden;
}

/* Console Header */
.console-header {
  padding: 1.5rem;
  border-bottom: 1px solid #e5e7eb;
  background-color: #f9fafb;
}

.console-title {
  font-size: 1.25rem;
  font-weight: 700;
  color: #111827;
  margin: 0 0 0.25rem 0;
}

.console-subtitle {
  font-size: 0.875rem;
  color: #6b7280;
  margin: 0;
}

/* Empty State */
.empty-state,
.warning-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  padding: 3rem 2rem;
  text-align: center;
}

.empty-icon,
.warning-icon {
  width: 4rem;
  height: 4rem;
  margin-bottom: 1rem;
}

.empty-icon {
  color: #9ca3af;
}

.warning-icon {
  color: #f59e0b;
}

.empty-text,
.warning-text {
  font-size: 1rem;
  font-weight: 600;
  color: #374151;
  margin: 0 0 0.5rem 0;
}

.empty-hint,
.warning-hint {
  font-size: 0.875rem;
  color: #6b7280;
  margin: 0;
}

/* Selected Section */
.selected-section {
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow: hidden;
}

.selection-info {
  display: flex;
  gap: 1rem;
  padding: 1rem;
  background-color: #dbeafe;
  border-bottom: 1px solid #93c5fd;
}

.info-icon {
  width: 1.5rem;
  height: 1.5rem;
  color: #3b82f6;
  flex-shrink: 0;
  margin-top: 0.125rem;
}

.info-title {
  font-size: 0.875rem;
  font-weight: 600;
  color: #1e40af;
  margin: 0 0 0.25rem 0;
}

.info-subtitle {
  font-size: 0.75rem;
  color: #1e40af;
  margin: 0;
}

/* Selected List */
.selected-list {
  flex: 1;
  overflow-y: auto;
  padding: 1rem;
}

.selected-item {
  display: flex;
  gap: 1rem;
  padding: 1rem;
  border: 2px solid #e5e7eb;
  border-radius: 0.5rem;
  margin-bottom: 0.75rem;
  transition: all 0.2s ease;
}

.selected-item.primary {
  border-color: #3b82f6;
  background-color: #eff6ff;
}

.radio-wrapper {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
  padding-top: 0.25rem;
}

.primary-radio {
  width: 1.25rem;
  height: 1.25rem;
  cursor: pointer;
  accent-color: #3b82f6;
}

.radio-label {
  font-size: 0.625rem;
  color: #6b7280;
  font-weight: 500;
  text-align: center;
  cursor: pointer;
}

.item-info {
  flex: 1;
  min-width: 0;
}

.item-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 0.5rem;
}

.item-name {
  font-size: 1rem;
  font-weight: 600;
  color: #111827;
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.item-id {
  font-size: 0.75rem;
  color: #6b7280;
  background-color: #f3f4f6;
  padding: 0.125rem 0.5rem;
  border-radius: 0.25rem;
  flex-shrink: 0;
}

.item-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.stat-badge {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.75rem;
  color: #6b7280;
  background-color: #f9fafb;
  padding: 0.25rem 0.5rem;
  border-radius: 0.25rem;
}

.stat-icon {
  width: 0.875rem;
  height: 0.875rem;
  flex-shrink: 0;
}

/* Merge Summary */
.merge-summary {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
  padding: 1rem;
  background-color: #fef3c7;
  border-top: 1px solid #fbbf24;
  border-bottom: 1px solid #fbbf24;
}

.summary-item {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.summary-label {
  font-size: 0.75rem;
  color: #92400e;
  font-weight: 500;
}

.summary-value {
  font-size: 1.25rem;
  font-weight: 700;
  color: #78350f;
}

/* Merge Button */
.merge-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  margin: 1rem;
  padding: 0.875rem 1.5rem;
  background-color: #f59e0b;
  color: white;
  border: none;
  border-radius: 0.5rem;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.merge-btn:hover:not(:disabled) {
  background-color: #d97706;
  transform: translateY(-1px);
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
}

.merge-btn:disabled {
  background-color: #d1d5db;
  cursor: not-allowed;
  transform: none;
}

.btn-icon {
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

/* Merge Warning */
.merge-warning {
  font-size: 0.75rem;
  color: #dc2626;
  text-align: center;
  margin: 0 1rem 1rem 1rem;
  padding: 0.5rem;
  background-color: #fee2e2;
  border-radius: 0.375rem;
}

/* Scrollbar Styling */
.selected-list::-webkit-scrollbar {
  width: 0.5rem;
}

.selected-list::-webkit-scrollbar-track {
  background-color: #f3f4f6;
}

.selected-list::-webkit-scrollbar-thumb {
  background-color: #d1d5db;
  border-radius: 0.25rem;
}

.selected-list::-webkit-scrollbar-thumb:hover {
  background-color: #9ca3af;
}
</style>
