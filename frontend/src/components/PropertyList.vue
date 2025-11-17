<template>
  <div class="property-list">
    <!-- Loading State -->
    <LoadingSpinner v-if="loading" size="lg" text="加载中..." />

    <!-- Empty State -->
    <EmptyState
      v-else-if="!properties || properties.length === 0"
      icon="search"
      title="暂无数据"
      description="没有找到符合条件的房源，请尝试调整筛选条件"
    />

    <!-- Property Table -->
    <div v-else class="property-table">
      <!-- Table Header -->
      <div class="table-header">
        <div 
          v-for="col in columns" 
          :key="col.key"
          :class="['header-cell', col.sortable && 'sortable', `col-${col.key}`]"
          :style="{ width: col.width }"
          @click="col.sortable && handleSort(col.key)"
        >
          <span>{{ col.label }}</span>
          <span v-if="col.sortable" class="sort-icon">
            <span v-if="sortBy === col.key">
              {{ sortOrder === 'asc' ? '↑' : '↓' }}
            </span>
            <span v-else class="sort-placeholder">⇅</span>
          </span>
        </div>
      </div>

      <!-- Virtual Scrolling Body -->
      <div ref="scrollContainer" class="table-body" @scroll="handleScroll">
        <div :style="{ height: `${totalHeight}px`, position: 'relative' }">
          <PropertyRow
            v-for="item in visibleItems"
            :key="item.data.id"
            :property="item.data"
            :style="{ 
              position: 'absolute',
              top: `${item.start}px`,
              left: 0,
              right: 0,
              height: `${rowHeight}px`
            }"
            @view-detail="$emit('view-detail', item.data)"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { usePropertyStore } from '@/stores/property'
import PropertyRow from './PropertyRow.vue'
import LoadingSpinner from './LoadingSpinner.vue'
import EmptyState from './EmptyState.vue'
import type { Property } from '@/api/types'

interface Column {
  key: string
  label: string
  sortable: boolean
  width?: string
}

interface Props {
  properties: Property[]
  loading?: boolean
}

interface Emits {
  (e: 'view-detail', property: Property): void
}

const props = withDefaults(defineProps<Props>(), {
  loading: false
})

defineEmits<Emits>()

const propertyStore = usePropertyStore()

// Column definitions
const columns: Column[] = [
  { key: 'source_property_id', label: '房源ID', sortable: true, width: '120px' },
  { key: 'floor_plan', label: '户型图', sortable: false, width: '80px' },
  { key: 'community_name', label: '小区', sortable: true, width: '150px' },
  { key: 'status', label: '状态', sortable: true, width: '80px' },
  { key: 'district', label: '区域', sortable: false, width: '100px' },
  { key: 'business_circle', label: '商圈', sortable: false, width: '120px' },
  { key: 'rooms', label: '户型', sortable: false, width: '100px' },
  { key: 'orientation', label: '朝向', sortable: false, width: '80px' },
  { key: 'floor_level', label: '楼层', sortable: false, width: '100px' },
  { key: 'build_area', label: '面积(㎡)', sortable: true, width: '100px' },
  { key: 'total_price', label: '总价(万)', sortable: true, width: '100px' },
  { key: 'unit_price', label: '单价(元/㎡)', sortable: true, width: '120px' },
  { key: 'timeline', label: '挂牌/成交时间', sortable: false, width: '140px' },
  { key: 'data_source', label: '数据源', sortable: false, width: '100px' },
  { key: 'actions', label: '操作', sortable: false, width: '80px' }
]

// Virtual scrolling configuration
const rowHeight = 60
const buffer = 10 // Increased buffer for smoother scrolling (was 5)
const scrollContainer = ref<HTMLElement | null>(null)
const scrollTop = ref(0)
const containerHeight = ref(600)

// Sorting state
const sortBy = computed(() => propertyStore.filters.sort_by)
const sortOrder = computed(() => propertyStore.filters.sort_order)

// Virtual scrolling calculations
const totalHeight = computed(() => props.properties.length * rowHeight)

const visibleRange = computed(() => {
  const start = Math.floor(scrollTop.value / rowHeight)
  const visibleCount = Math.ceil(containerHeight.value / rowHeight)
  const end = start + visibleCount
  
  return {
    start: Math.max(0, start - buffer),
    end: Math.min(props.properties.length, end + buffer)
  }
})

const visibleItems = computed(() => {
  const items = []
  for (let i = visibleRange.value.start; i < visibleRange.value.end; i++) {
    items.push({
      index: i,
      data: props.properties[i],
      start: i * rowHeight
    })
  }
  return items
})

// Event handlers
const handleSort = (key: string) => {
  propertyStore.toggleSort(key)
}

const handleScroll = (event: Event) => {
  const target = event.target as HTMLElement
  scrollTop.value = target.scrollTop
}

// Update container height on mount and resize
const updateContainerHeight = () => {
  if (scrollContainer.value) {
    containerHeight.value = scrollContainer.value.clientHeight
  }
}

onMounted(() => {
  updateContainerHeight()
  window.addEventListener('resize', updateContainerHeight)
})

onUnmounted(() => {
  window.removeEventListener('resize', updateContainerHeight)
})

// Reset scroll position when properties change
watch(() => props.properties, () => {
  if (scrollContainer.value) {
    scrollContainer.value.scrollTop = 0
    scrollTop.value = 0
  }
})
</script>

<style scoped>
.property-list {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}

/* Loading and empty states are now handled by dedicated components */

.property-table {
  display: flex;
  flex-direction: column;
  height: 100%;
  border: 1px solid #e5e7eb;
  border-radius: 0.5rem;
  overflow: hidden;
  background: white;
  box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1);
}

.table-header {
  display: flex;
  background: linear-gradient(to bottom, #ffffff, #f9fafb);
  border-bottom: 2px solid #e5e7eb;
  font-weight: 600;
  color: #374151;
  font-size: 0.875rem;
  flex-shrink: 0;
  position: sticky;
  top: 0;
  z-index: 10;
}

.header-cell {
  padding: 1rem 0.75rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  border-right: 1px solid #e5e7eb;
  user-select: none;
  position: relative;
}

.header-cell:last-child {
  border-right: none;
}

.header-cell.sortable {
  cursor: pointer;
  transition: all 0.2s ease;
}

.header-cell.sortable:hover {
  background: rgba(59, 130, 246, 0.05);
  color: #3b82f6;
}

.header-cell.sortable:hover::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: #3b82f6;
}

.sort-icon {
  font-size: 0.875rem;
  color: #3b82f6;
  min-width: 1rem;
  text-align: center;
}

.sort-placeholder {
  color: #d1d5db;
}

.table-body {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  position: relative;
}

.table-body::-webkit-scrollbar {
  width: 8px;
}

.table-body::-webkit-scrollbar-track {
  background: #f1f1f1;
}

.table-body::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 4px;
}

.table-body::-webkit-scrollbar-thumb:hover {
  background: #94a3b8;
}
</style>
