<template>
  <div class="filter-panel">
    <div class="filter-section">
      <label class="filter-label">状态</label>
      <div class="status-buttons">
        <button
          :class="['status-btn', { active: filters.status === null }]"
          @click="updateStatus(null)"
        >
          全部
        </button>
        <button
          :class="['status-btn', { active: filters.status === '在售' }]"
          @click="updateStatus('在售')"
        >
          在售
        </button>
        <button
          :class="['status-btn', { active: filters.status === '成交' }]"
          @click="updateStatus('成交')"
        >
          成交
        </button>
      </div>
    </div>

    <div class="filter-section">
      <label class="filter-label" for="community-name">小区名</label>
      <input
        id="community-name"
        v-model="communityNameInput"
        type="text"
        class="text-input"
        placeholder="输入小区名搜索..."
        @input="handleCommunityNameChange"
      />
    </div>

    <div class="filter-section">
      <label class="filter-label">
        价格范围 (万)
        <span class="range-value">{{ filters.min_price }} - {{ filters.max_price }}</span>
      </label>
      <div class="range-slider-container">
        <input
          v-model.number="priceRange.min"
          type="range"
          min="0"
          max="20000"
          step="100"
          class="range-slider range-slider-min"
          @input="handlePriceChange"
        />
        <input
          v-model.number="priceRange.max"
          type="range"
          min="0"
          max="20000"
          step="100"
          class="range-slider range-slider-max"
          @input="handlePriceChange"
        />
      </div>
      <div class="range-labels">
        <span>0</span>
        <span>20000</span>
      </div>
    </div>

    <div class="filter-section">
      <label class="filter-label">
        面积范围 (㎡)
        <span class="range-value">{{ filters.min_area }} - {{ filters.max_area }}</span>
      </label>
      <div class="range-slider-container">
        <input
          v-model.number="areaRange.min"
          type="range"
          min="0"
          max="300"
          step="10"
          class="range-slider range-slider-min"
          @input="handleAreaChange"
        />
        <input
          v-model.number="areaRange.max"
          type="range"
          min="0"
          max="300"
          step="10"
          class="range-slider range-slider-max"
          @input="handleAreaChange"
        />
      </div>
      <div class="range-labels">
        <span>0</span>
        <span>300</span>
      </div>
    </div>

    <div class="filter-section">
      <label class="filter-label">户型 (室)</label>
      <div class="room-select">
        <div
          v-for="room in roomOptions"
          :key="room"
          :class="['room-option', { selected: isRoomSelected(room) }]"
          @click="toggleRoom(room)"
        >
          {{ room }}室
        </div>
      </div>
    </div>

    <div class="filter-actions">
      <button class="reset-btn" @click="handleReset">
        重置筛选
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { usePropertyStore } from '@/stores/property'
import { debounce } from '@/utils/debounce'

const propertyStore = usePropertyStore()

// Get filters from store
const filters = computed(() => propertyStore.filters)

// Local state for text input (for debouncing)
const communityNameInput = ref(filters.value.community_name || '')

// Local state for range sliders
const priceRange = ref({
  min: filters.value.min_price || 0,
  max: filters.value.max_price || 20000
})

const areaRange = ref({
  min: filters.value.min_area || 0,
  max: filters.value.max_area || 300
})

// Room options (1-5 bedrooms)
const roomOptions = [1, 2, 3, 4, 5]

// Create debounced update functions (300ms delay)
const debouncedUpdateCommunityName = debounce((value: string) => {
  propertyStore.updateFilter('community_name', value)
}, 300)

const debouncedUpdatePriceRange = debounce((min: number, max: number) => {
  propertyStore.updateFilter('min_price', min)
  propertyStore.updateFilter('max_price', max)
}, 300)

const debouncedUpdateAreaRange = debounce((min: number, max: number) => {
  propertyStore.updateFilter('min_area', min)
  propertyStore.updateFilter('max_area', max)
}, 300)

// Event handlers
const updateStatus = (status: '在售' | '成交' | null) => {
  propertyStore.updateFilter('status', status)
}

const handleCommunityNameChange = () => {
  debouncedUpdateCommunityName(communityNameInput.value)
}

const handlePriceChange = () => {
  // Ensure min doesn't exceed max
  let min = priceRange.value.min
  let max = priceRange.value.max
  
  if (min > max) {
    [min, max] = [max, min]
    priceRange.value.min = min
    priceRange.value.max = max
  }
  
  debouncedUpdatePriceRange(min, max)
}

const handleAreaChange = () => {
  // Ensure min doesn't exceed max
  let min = areaRange.value.min
  let max = areaRange.value.max
  
  if (min > max) {
    [min, max] = [max, min]
    areaRange.value.min = min
    areaRange.value.max = max
  }
  
  debouncedUpdateAreaRange(min, max)
}

const isRoomSelected = (room: number): boolean => {
  return filters.value.rooms?.includes(room) || false
}

const toggleRoom = (room: number) => {
  const currentRooms = filters.value.rooms || []
  const newRooms = isRoomSelected(room)
    ? currentRooms.filter(r => r !== room)
    : [...currentRooms, room]
  
  propertyStore.updateFilter('rooms', newRooms)
}

const handleReset = () => {
  propertyStore.resetFilters()
  
  // Reset local state
  communityNameInput.value = ''
  priceRange.value = { min: 0, max: 20000 }
  areaRange.value = { min: 0, max: 300 }
}

// Watch for external changes to filters (e.g., from reset)
watch(() => filters.value.community_name, (newVal) => {
  if (newVal !== communityNameInput.value) {
    communityNameInput.value = newVal || ''
  }
})

watch(() => [filters.value.min_price, filters.value.max_price], ([newMin, newMax]) => {
  priceRange.value.min = newMin || 0
  priceRange.value.max = newMax || 20000
})

watch(() => [filters.value.min_area, filters.value.max_area], ([newMin, newMax]) => {
  areaRange.value.min = newMin || 0
  areaRange.value.max = newMax || 300
})
</script>

<style scoped>
.filter-panel {
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 0.5rem;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1);
  transition: box-shadow 0.3s ease;
}

.filter-panel:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
}

.filter-section {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.filter-label {
  font-size: 0.875rem;
  font-weight: 600;
  color: #374151;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.range-value {
  font-weight: 500;
  color: #3b82f6;
  font-size: 0.875rem;
}

/* Status Buttons */
.status-buttons {
  display: flex;
  gap: 0.5rem;
}

.status-btn {
  flex: 1;
  padding: 0.5rem 1rem;
  border: 1px solid #d1d5db;
  background: white;
  color: #6b7280;
  border-radius: 0.375rem;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.status-btn:hover {
  border-color: #3b82f6;
  color: #3b82f6;
}

.status-btn.active {
  background: #3b82f6;
  border-color: #3b82f6;
  color: white;
  box-shadow: 0 2px 4px rgba(59, 130, 246, 0.3);
}

/* Text Input */
.text-input {
  width: 100%;
  padding: 0.5rem 0.75rem;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  font-size: 0.875rem;
  transition: border-color 0.2s;
}

.text-input:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.text-input::placeholder {
  color: #9ca3af;
}

/* Range Sliders */
.range-slider-container {
  position: relative;
  height: 2rem;
  display: flex;
  align-items: center;
}

.range-slider {
  position: absolute;
  width: 100%;
  height: 6px;
  -webkit-appearance: none;
  appearance: none;
  background: transparent;
  pointer-events: none;
}

.range-slider::-webkit-slider-track {
  width: 100%;
  height: 6px;
  background: #e5e7eb;
  border-radius: 3px;
}

.range-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 18px;
  height: 18px;
  background: #3b82f6;
  border: 2px solid white;
  border-radius: 50%;
  cursor: pointer;
  pointer-events: auto;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

.range-slider::-webkit-slider-thumb:hover {
  background: #2563eb;
}

.range-slider::-moz-range-track {
  width: 100%;
  height: 6px;
  background: #e5e7eb;
  border-radius: 3px;
}

.range-slider::-moz-range-thumb {
  width: 18px;
  height: 18px;
  background: #3b82f6;
  border: 2px solid white;
  border-radius: 50%;
  cursor: pointer;
  pointer-events: auto;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

.range-slider::-moz-range-thumb:hover {
  background: #2563eb;
}

.range-slider-min {
  z-index: 1;
}

.range-slider-max {
  z-index: 2;
}

.range-labels {
  display: flex;
  justify-content: space-between;
  font-size: 0.75rem;
  color: #6b7280;
  margin-top: 0.25rem;
}

/* Room Selection */
.room-select {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.room-option {
  padding: 0.5rem 1rem;
  border: 1px solid #d1d5db;
  background: white;
  color: #6b7280;
  border-radius: 0.375rem;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  user-select: none;
}

.room-option:hover {
  border-color: #3b82f6;
  color: #3b82f6;
}

.room-option.selected {
  background: #3b82f6;
  border-color: #3b82f6;
  color: white;
  box-shadow: 0 2px 4px rgba(59, 130, 246, 0.3);
}

/* Filter Actions */
.filter-actions {
  padding-top: 0.5rem;
  border-top: 1px solid #e5e7eb;
}

.reset-btn {
  width: 100%;
  padding: 0.625rem 1rem;
  border: 1px solid #d1d5db;
  background: white;
  color: #6b7280;
  border-radius: 0.375rem;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.reset-btn:hover {
  background: #f9fafb;
  border-color: #9ca3af;
  color: #374151;
}

.reset-btn:active {
  background: #f3f4f6;
}
</style>
