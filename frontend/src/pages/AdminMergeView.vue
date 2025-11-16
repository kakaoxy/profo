<template>
  <div class="admin-merge-view">
    <!-- Page Header -->
    <div class="page-header">
      <div class="header-content">
        <h1 class="page-title">小区数据治理</h1>
        <p class="page-subtitle">合并重复的小区记录，提升数据质量</p>
      </div>
    </div>

    <!-- Main Content -->
    <div class="page-content">
      <div class="layout-grid">
        <!-- Left Panel: Community List -->
        <div class="panel left-panel">
          <CommunityList
            ref="communityListRef"
            v-model:selected-ids="selectedIds"
            @communities-loaded="handleCommunitiesLoaded"
          />
        </div>

        <!-- Right Panel: Merge Console -->
        <div class="panel right-panel">
          <CommunityMergeConsole
            :selected-communities="selectedCommunitiesData"
            @merge-success="handleMergeSuccess"
          />
        </div>
      </div>
    </div>

    <!-- Confirm Dialog -->
    <ConfirmDialog />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useErrorBoundary } from '@/composables/useErrorBoundary'
import CommunityList from '@/components/CommunityList.vue'
import CommunityMergeConsole from '@/components/CommunityMergeConsole.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import type { Community } from '@/api/types'

// Setup error boundary for this component
useErrorBoundary('数据治理页')

// Refs
const communityListRef = ref<InstanceType<typeof CommunityList> | null>(null)
const selectedIds = ref<number[]>([])
const allCommunities = ref<Community[]>([])

// Computed
const selectedCommunitiesData = computed(() => {
  // Fetch full community data for selected IDs
  // We need to get this from the CommunityList component's data
  // For now, we'll fetch it when needed
  return allCommunities.value.filter((c: Community) => selectedIds.value.includes(c.id))
})

// Methods
const handleMergeSuccess = () => {
  // Clear selection
  selectedIds.value = []
  
  // Refresh community list
  if (communityListRef.value) {
    communityListRef.value.refresh()
  }
}

const handleCommunitiesLoaded = (communities: Community[]) => {
  // Update allCommunities when CommunityList loads data
  allCommunities.value = communities
}
</script>

<style scoped>
.admin-merge-view {
  width: 100%;
  min-height: 100vh;
  background-color: #f3f4f6;
  display: flex;
  flex-direction: column;
}

/* Page Header */
.page-header {
  background-color: white;
  border-bottom: 1px solid #e5e7eb;
  box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1);
}

.header-content {
  max-width: 1400px;
  margin: 0 auto;
  padding: 2rem;
}

.page-title {
  font-size: 1.875rem;
  font-weight: 700;
  color: #111827;
  margin: 0 0 0.5rem 0;
}

.page-subtitle {
  font-size: 1rem;
  color: #6b7280;
  margin: 0;
}

/* Page Content */
.page-content {
  flex: 1;
  padding: 2rem;
  overflow: hidden;
}

.layout-grid {
  max-width: 1400px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 2rem;
  height: calc(100vh - 180px);
}

.panel {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* Responsive Design */
@media (max-width: 1024px) {
  .layout-grid {
    grid-template-columns: 1fr;
    height: auto;
  }
  
  .panel {
    min-height: 500px;
  }
}

@media (max-width: 640px) {
  .header-content {
    padding: 1.5rem 1rem;
  }
  
  .page-content {
    padding: 1rem;
  }
  
  .layout-grid {
    gap: 1rem;
  }
  
  .page-title {
    font-size: 1.5rem;
  }
  
  .page-subtitle {
    font-size: 0.875rem;
  }
}
</style>
