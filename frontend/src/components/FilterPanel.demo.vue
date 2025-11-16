<template>
  <div class="demo-container">
    <h1 class="demo-title">FilterPanel 组件演示</h1>
    
    <div class="demo-layout">
      <!-- Filter Panel -->
      <div class="demo-section">
        <h2 class="section-title">筛选面板</h2>
        <FilterPanel />
      </div>

      <!-- Current Filters Display -->
      <div class="demo-section">
        <h2 class="section-title">当前筛选条件</h2>
        <div class="filters-display">
          <div class="filter-item">
            <span class="filter-key">状态:</span>
            <span class="filter-value">{{ filters.status || '全部' }}</span>
          </div>
          <div class="filter-item">
            <span class="filter-key">小区名:</span>
            <span class="filter-value">{{ filters.community_name || '(未设置)' }}</span>
          </div>
          <div class="filter-item">
            <span class="filter-key">价格范围:</span>
            <span class="filter-value">{{ filters.min_price }} - {{ filters.max_price }} 万</span>
          </div>
          <div class="filter-item">
            <span class="filter-key">面积范围:</span>
            <span class="filter-value">{{ filters.min_area }} - {{ filters.max_area }} ㎡</span>
          </div>
          <div class="filter-item">
            <span class="filter-key">户型:</span>
            <span class="filter-value">
              {{ filters.rooms && filters.rooms.length > 0 
                ? filters.rooms.map((r: number) => `${r}室`).join(', ') 
                : '(未选择)' 
              }}
            </span>
          </div>
          <div class="filter-item">
            <span class="filter-key">排序:</span>
            <span class="filter-value">{{ filters.sort_by }} ({{ filters.sort_order }})</span>
          </div>
          <div class="filter-item">
            <span class="filter-key">页码:</span>
            <span class="filter-value">{{ filters.page }} / 每页 {{ filters.page_size }}</span>
          </div>
        </div>

        <div class="demo-actions">
          <button class="demo-btn" @click="simulateFilterChange">
            模拟外部修改筛选条件
          </button>
          <button class="demo-btn" @click="logFilters">
            打印筛选条件到控制台
          </button>
        </div>
      </div>
    </div>

    <div class="demo-info">
      <h3>功能说明</h3>
      <ul>
        <li>✅ 状态切换按钮 (全部/在售/成交)</li>
        <li>✅ 小区名文本输入 (300ms 防抖)</li>
        <li>✅ 价格双滑块范围选择 (0-20000万)</li>
        <li>✅ 面积双滑块范围选择 (0-300㎡)</li>
        <li>✅ 户型多选 (1-5室)</li>
        <li>✅ 重置筛选按钮</li>
        <li>✅ 绑定到 Pinia store</li>
        <li>✅ 筛选条件变化时自动重置页码到第1页</li>
      </ul>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { usePropertyStore } from '@/stores/property'
import FilterPanel from './FilterPanel.vue'

const propertyStore = usePropertyStore()
const filters = computed(() => propertyStore.filters)

const simulateFilterChange = () => {
  // Simulate external filter changes
  propertyStore.updateFilter('status', '在售')
  propertyStore.updateFilter('min_price', 500)
  propertyStore.updateFilter('max_price', 1500)
  propertyStore.updateFilter('rooms', [2, 3])
}

const logFilters = () => {
  console.log('Current Filters:', JSON.stringify(filters.value, null, 2))
}
</script>

<style scoped>
.demo-container {
  padding: 2rem;
  max-width: 1400px;
  margin: 0 auto;
  background: #f9fafb;
  min-height: 100vh;
}

.demo-title {
  font-size: 2rem;
  font-weight: 700;
  color: #111827;
  margin-bottom: 2rem;
}

.demo-layout {
  display: grid;
  grid-template-columns: 400px 1fr;
  gap: 2rem;
  margin-bottom: 2rem;
}

.demo-section {
  background: white;
  border-radius: 0.5rem;
  padding: 1.5rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.section-title {
  font-size: 1.25rem;
  font-weight: 600;
  color: #374151;
  margin-bottom: 1rem;
}

.filters-display {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-bottom: 1.5rem;
}

.filter-item {
  display: flex;
  padding: 0.75rem;
  background: #f9fafb;
  border-radius: 0.375rem;
  border: 1px solid #e5e7eb;
}

.filter-key {
  font-weight: 600;
  color: #6b7280;
  min-width: 100px;
}

.filter-value {
  color: #111827;
  font-family: 'Courier New', monospace;
}

.demo-actions {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.demo-btn {
  padding: 0.625rem 1rem;
  background: #3b82f6;
  color: white;
  border: none;
  border-radius: 0.375rem;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s;
}

.demo-btn:hover {
  background: #2563eb;
}

.demo-btn:active {
  background: #1d4ed8;
}

.demo-info {
  background: white;
  border-radius: 0.5rem;
  padding: 1.5rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.demo-info h3 {
  font-size: 1.125rem;
  font-weight: 600;
  color: #374151;
  margin-bottom: 1rem;
}

.demo-info ul {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.demo-info li {
  color: #6b7280;
  font-size: 0.875rem;
  padding-left: 0.5rem;
}

@media (max-width: 1024px) {
  .demo-layout {
    grid-template-columns: 1fr;
  }
}
</style>
