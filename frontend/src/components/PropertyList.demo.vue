<template>
  <div class="demo-container">
    <h1 class="demo-title">PropertyList Component Demo</h1>
    
    <div class="demo-controls">
      <button @click="loadMockData(10)" class="demo-btn">Load 10 Items</button>
      <button @click="loadMockData(100)" class="demo-btn">Load 100 Items</button>
      <button @click="loadMockData(1000)" class="demo-btn">Load 1000 Items</button>
      <button @click="toggleLoading" class="demo-btn">Toggle Loading</button>
      <button @click="clearData" class="demo-btn">Clear Data</button>
    </div>

    <div class="demo-info">
      <p>Total Properties: {{ properties.length }}</p>
      <p>Loading: {{ loading }}</p>
      <p>Current Sort: {{ propertyStore.filters.sort_by }} ({{ propertyStore.filters.sort_order }})</p>
    </div>

    <div class="demo-list-container">
      <PropertyList
        :properties="properties"
        :loading="loading"
        @view-detail="handleViewDetail"
      />
    </div>

    <!-- Simple detail display -->
    <div v-if="selectedProperty" class="demo-detail">
      <h3>Selected Property Details</h3>
      <button @click="selectedProperty = null" class="demo-close-btn">Close</button>
      <pre>{{ JSON.stringify(selectedProperty, null, 2) }}</pre>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import PropertyList from './PropertyList.vue'
import { usePropertyStore } from '@/stores/property'
import type { Property } from '@/api/types'

const propertyStore = usePropertyStore()
const properties = ref<Property[]>([])
const loading = ref(false)
const selectedProperty = ref<Property | null>(null)

// Generate mock property data
const generateMockProperty = (index: number): Property => {
  const status = index % 3 === 0 ? '成交' : '在售'
  const rooms = [1, 2, 3, 4][index % 4]
  const halls = [1, 2][index % 2]
  const baths = [1, 2][index % 2]
  const buildArea = 50 + Math.random() * 200
  const totalPrice = 300 + Math.random() * 1700
  const unitPrice = (totalPrice * 10000) / buildArea

  return {
    id: index + 1,
    data_source: ['链家', '贝壳', '安居客'][index % 3],
    source_property_id: `PROP${String(index + 1).padStart(6, '0')}`,
    status,
    community_name: `测试小区${Math.floor(index / 10) + 1}`,
    rooms,
    halls,
    baths,
    orientation: ['南', '北', '东', '西', '南北', '东西'][index % 6],
    floor_original: `${Math.floor(Math.random() * 30) + 1}/${Math.floor(Math.random() * 30) + 10}`,
    floor_number: Math.floor(Math.random() * 30) + 1,
    total_floors: Math.floor(Math.random() * 30) + 10,
    floor_level: ['低楼层', '中楼层', '高楼层'][index % 3],
    build_area: buildArea,
    listed_price_wan: status === '在售' ? totalPrice : undefined,
    sold_price_wan: status === '成交' ? totalPrice : undefined,
    unit_price: unitPrice,
    listed_date: status === '在售' ? '2024-01-15' : undefined,
    sold_date: status === '成交' ? '2024-02-20' : undefined,
    transaction_duration_days: status === '成交' ? Math.floor(Math.random() * 90) : undefined,
    property_type: ['普通住宅', '公寓', '别墅'][index % 3],
    build_year: 2000 + Math.floor(Math.random() * 24),
    decoration: ['毛坯', '简装', '精装', '豪装'][index % 4],
    elevator: Math.random() > 0.3 ? '有' : '无',
    ownership_type: '商品房',
    ownership_years: '70年',
    last_transaction: undefined,
    mortgage_info: undefined,
    listing_remarks: `这是测试房源 ${index + 1} 的备注信息`,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }
}

const loadMockData = (count: number) => {
  loading.value = true
  
  // Simulate API delay
  setTimeout(() => {
    properties.value = Array.from({ length: count }, (_, i) => generateMockProperty(i))
    loading.value = false
  }, 500)
}

const toggleLoading = () => {
  loading.value = !loading.value
}

const clearData = () => {
  properties.value = []
  selectedProperty.value = null
}

const handleViewDetail = (property: Property) => {
  selectedProperty.value = property
  console.log('View detail:', property)
}

// Load initial data
loadMockData(50)
</script>

<style scoped>
.demo-container {
  padding: 2rem;
  max-width: 1400px;
  margin: 0 auto;
}

.demo-title {
  font-size: 2rem;
  font-weight: bold;
  margin-bottom: 1.5rem;
  color: #1f2937;
}

.demo-controls {
  display: flex;
  gap: 1rem;
  margin-bottom: 1rem;
  flex-wrap: wrap;
}

.demo-btn {
  padding: 0.5rem 1rem;
  background: #3b82f6;
  color: white;
  border: none;
  border-radius: 0.375rem;
  cursor: pointer;
  font-size: 0.875rem;
  font-weight: 500;
  transition: background-color 0.2s;
}

.demo-btn:hover {
  background: #2563eb;
}

.demo-info {
  background: #f3f4f6;
  padding: 1rem;
  border-radius: 0.375rem;
  margin-bottom: 1rem;
  font-size: 0.875rem;
  color: #4b5563;
}

.demo-info p {
  margin: 0.25rem 0;
}

.demo-list-container {
  height: 600px;
  border: 2px solid #e5e7eb;
  border-radius: 0.5rem;
  overflow: hidden;
  background: white;
}

.demo-detail {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: white;
  padding: 2rem;
  border-radius: 0.5rem;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
  max-width: 600px;
  max-height: 80vh;
  overflow: auto;
  z-index: 1000;
}

.demo-detail h3 {
  margin-top: 0;
  margin-bottom: 1rem;
  font-size: 1.25rem;
  font-weight: 600;
}

.demo-close-btn {
  position: absolute;
  top: 1rem;
  right: 1rem;
  padding: 0.5rem 1rem;
  background: #ef4444;
  color: white;
  border: none;
  border-radius: 0.375rem;
  cursor: pointer;
  font-size: 0.875rem;
}

.demo-detail pre {
  background: #f9fafb;
  padding: 1rem;
  border-radius: 0.375rem;
  overflow: auto;
  font-size: 0.75rem;
  line-height: 1.5;
}
</style>
