<template>
  <div class="demo-container">
    <h2>ExportBtn Component Demo</h2>
    
    <div class="demo-section">
      <h3>Basic Usage</h3>
      <ExportBtn />
    </div>
    
    <div class="demo-section">
      <h3>Current Filters</h3>
      <div class="filter-display">
        <p><strong>状态:</strong> {{ filters.status || '全部' }}</p>
        <p><strong>小区名:</strong> {{ filters.community_name || '无' }}</p>
        <p><strong>价格范围:</strong> {{ filters.min_price }} - {{ filters.max_price }} 万</p>
        <p><strong>面积范围:</strong> {{ filters.min_area }} - {{ filters.max_area }} ㎡</p>
        <p><strong>户型:</strong> {{ filters.rooms?.length ? filters.rooms.join(', ') + '室' : '全部' }}</p>
        <p><strong>排序:</strong> {{ filters.sort_by }} ({{ filters.sort_order }})</p>
      </div>
    </div>
    
    <div class="demo-section">
      <h3>Test Filters</h3>
      <div class="test-controls">
        <button @click="setTestFilters">设置测试筛选条件</button>
        <button @click="resetFilters">重置筛选条件</button>
      </div>
    </div>
    
    <div class="demo-section">
      <h3>Instructions</h3>
      <ol>
        <li>点击"导出 CSV"按钮测试导出功能</li>
        <li>按钮会显示加载状态并在导出完成后恢复</li>
        <li>导出使用当前的筛选条件（不包括分页）</li>
        <li>成功后会显示成功提示并自动下载文件</li>
        <li>失败时会显示错误提示</li>
      </ol>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import ExportBtn from './ExportBtn.vue'
import { usePropertyStore } from '@/stores/property'

const propertyStore = usePropertyStore()
const filters = computed(() => propertyStore.filters)

const setTestFilters = () => {
  propertyStore.updateFilter('status', '在售')
  propertyStore.updateFilter('community_name', '测试小区')
  propertyStore.updateFilter('min_price', 500)
  propertyStore.updateFilter('max_price', 1000)
  propertyStore.updateFilter('rooms', [2, 3])
}

const resetFilters = () => {
  propertyStore.resetFilters()
}
</script>

<style scoped>
.demo-container {
  padding: 2rem;
  max-width: 800px;
  margin: 0 auto;
}

h2 {
  font-size: 1.5rem;
  font-weight: bold;
  margin-bottom: 1.5rem;
  color: #1f2937;
}

h3 {
  font-size: 1.125rem;
  font-weight: 600;
  margin-bottom: 0.75rem;
  color: #374151;
}

.demo-section {
  margin-bottom: 2rem;
  padding: 1.5rem;
  background-color: white;
  border-radius: 0.5rem;
  box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1);
}

.filter-display {
  font-size: 0.875rem;
  color: #4b5563;
}

.filter-display p {
  margin-bottom: 0.5rem;
}

.test-controls {
  display: flex;
  gap: 1rem;
}

.test-controls button {
  padding: 0.5rem 1rem;
  background-color: #3b82f6;
  color: white;
  border: none;
  border-radius: 0.375rem;
  font-size: 0.875rem;
  cursor: pointer;
  transition: background-color 0.2s;
}

.test-controls button:hover {
  background-color: #2563eb;
}

ol {
  padding-left: 1.5rem;
  color: #4b5563;
  font-size: 0.875rem;
}

ol li {
  margin-bottom: 0.5rem;
}
</style>
