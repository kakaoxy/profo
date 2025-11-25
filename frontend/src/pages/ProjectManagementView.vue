<template>
  <div class="project-management-view">
    <!-- Page Header -->
    <div class="page-header">
      <div class="header-content">
        <h1 class="page-title">
          项目管理
          <span v-if="currentView !== 'dashboard'" class="breadcrumb">
            / {{ viewTitles[currentView] }}
          </span>
        </h1>
        <button 
          v-if="currentView !== 'dashboard'"
          class="back-button"
          @click="handleBackToDashboard"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          返回列表
        </button>
      </div>
    </div>

    <!-- Main Content -->
    <div class="content-container">
      <Dashboard
        v-if="currentView === 'dashboard'"
        @view-project="handleViewProject"
        @create-project="handleCreateProject"
        @view-cashflow="handleViewCashFlow"
      />
      <ProjectDetail
        v-else-if="currentView === 'detail'"
        :project-id="selectedProjectId"
        @back="handleBackToDashboard"
      />
      <CashFlow
        v-else-if="currentView === 'cashflow'"
        :project-id="selectedProjectId!"
        @back="handleBackToDashboard"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import Dashboard from '@/components/project_management/Dashboard.vue'
import ProjectDetail from '@/components/project_management/ProjectDetail.vue'
import CashFlow from '@/components/project_management/CashFlow.vue'

// View state management
type ViewType = 'dashboard' | 'detail' | 'cashflow'

const currentView = ref<ViewType>('dashboard')
const selectedProjectId = ref<string | null>(null)

const viewTitles: Record<ViewType, string> = {
  dashboard: '仪表盘',
  detail: '项目详情',
  cashflow: '现金流管理',
}

// Navigation handlers
const handleViewProject = (id: string): void => {
  selectedProjectId.value = id
  currentView.value = 'detail'
}

const handleCreateProject = (): void => {
  selectedProjectId.value = null // New project
  currentView.value = 'detail'
}

const handleViewCashFlow = (id: string): void => {
  selectedProjectId.value = id
  currentView.value = 'cashflow'
}

const handleBackToDashboard = (): void => {
  currentView.value = 'dashboard'
  selectedProjectId.value = null
}
</script>

<style scoped>
.project-management-view {
  width: 100%;
  min-height: 100vh;
  background-color: #f5f5f5;
  display: flex;
  flex-direction: column;
}

/* Page Header */
.page-header {
  background: linear-gradient(to bottom, #ffffff, #fafbfc);
  border-bottom: 1px solid #e5e7eb;
  padding: 1.5rem 2rem;
  position: sticky;
  top: 0;
  z-index: 10;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  backdrop-filter: blur(8px);
}

.header-content {
  max-width: 1920px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.page-title {
  font-size: 1.5rem;
  font-weight: 700;
  color: #111827;
  margin: 0;
  letter-spacing: -0.025em;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.breadcrumb {
  color: #9ca3af;
  font-weight: 400;
  font-size: 1rem;
}

.back-button {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  font-size: 0.875rem;
  font-weight: 500;
  color: #3b82f6;
  background-color: transparent;
  border: 1px solid #3b82f6;
  border-radius: 0.375rem;
  cursor: pointer;
  transition: all 0.2s ease;
}

.back-button:hover {
  background-color: #3b82f6;
  color: white;
}

.back-button .icon {
  width: 1rem;
  height: 1rem;
}

/* Content Container */
.content-container {
  flex: 1;
  padding: 1.5rem 2rem;
  max-width: 1920px;
  margin: 0 auto;
  width: 100%;
}

/* Responsive Design */
@media (max-width: 768px) {
  .page-header {
    padding: 1rem;
  }

  .header-content {
    flex-direction: column;
    align-items: flex-start;
    gap: 1rem;
  }

  .page-title {
    font-size: 1.25rem;
  }

  .breadcrumb {
    font-size: 0.875rem;
  }

  .content-container {
    padding: 1rem;
  }
}
</style>
