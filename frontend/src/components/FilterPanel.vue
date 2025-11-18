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
        <div :class="['room-option', { selected: roomsGteSelected }]" @click="toggleRoomsGte">5室以上</div>
      </div>
    </div>

    <div class="filter-section">
      <label class="filter-label">楼层</label>
      <div class="room-select">
        <div v-for="fl in floorLevelOptions" :key="fl" :class="['room-option', { selected: isFloorLevelSelected(fl) }]" @click="toggleFloorLevel(fl)">{{ fl }}</div>
      </div>
    </div>

    <div class="filter-section">
      <label class="filter-label">
        价格范围 (万)
        <span class="range-value">{{ formatThousand(filters.min_price) }} - {{ formatThousand(filters.max_price) }}</span>
      </label>
      <div class="range-input-row">
        <div class="range-input">
          <input v-model="priceInput.min" type="text" class="text-input" placeholder="最低价" @input="handlePriceInputChange('min')" />
          <span class="unit">万</span>
        </div>
        <div class="range-input">
          <input v-model="priceInput.max" type="text" class="text-input" placeholder="最高价" @input="handlePriceInputChange('max')" />
          <span class="unit">万</span>
        </div>
      </div>
    </div>

    <div class="filter-section">
      <label class="filter-label">
        面积范围 (㎡)
        <span class="range-value">{{ formatThousand(filters.min_area) }} - {{ formatThousand(filters.max_area) }}</span>
      </label>
      <div class="range-input-row">
        <div class="range-input">
          <input v-model="areaInput.min" type="text" class="text-input" placeholder="最小面积" @input="handleAreaInputChange('min')" />
          <span class="unit">㎡</span>
        </div>
        <div class="range-input">
          <input v-model="areaInput.max" type="text" class="text-input" placeholder="最大面积" @input="handleAreaInputChange('max')" />
          <span class="unit">㎡</span>
        </div>
      </div>
    </div>


    <div class="filter-section">
      <label class="filter-label">区域/商圈</label>
      <div class="district-bc-row">
        <div class="combo-box">
          <input
            v-model="districtQuery"
            type="text"
            class="text-input"
            placeholder="输入行政区，模糊匹配..."
            @input="handleDistrictQuery"
          />
          <div v-if="districtSuggestions.length > 0 && districtQuery" class="suggestions">
            <div v-for="d in districtSuggestions" :key="d" class="suggestion-item" @click="addDistrict(d)">{{ d }}</div>
          </div>
        </div>
        <div class="combo-box">
          <input
            v-model="businessQuery"
            type="text"
            class="text-input"
            placeholder="输入商圈，模糊匹配..."
            @input="handleBusinessQuery"
          />
          <div v-if="businessSuggestions.length > 0 && businessQuery" class="suggestions">
            <div v-for="b in businessSuggestions" :key="b" class="suggestion-item" @click="addBusinessCircle(b)">{{ b }}</div>
          </div>
        </div>
      </div>
      <div class="selected-tags" v-if="selectedDistricts.length || selectedBusinessCircles.length">
        <div class="tags-group" v-if="selectedDistricts.length">
          <span class="tags-label">行政区:</span>
          <span v-for="d in selectedDistricts" :key="d" class="tag" @click="removeDistrict(d)">{{ d }} ✕</span>
        </div>
        <div class="tags-group" v-if="selectedBusinessCircles.length">
          <span class="tags-label">商圈:</span>
          <span v-for="b in selectedBusinessCircles" :key="b" class="tag" @click="removeBusinessCircle(b)">{{ b }} ✕</span>
        </div>
        <button class="clear-tags" @click="clearAllArea">清除全部</button>
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
import { fetchDictionary } from '@/api/admin'

const propertyStore = usePropertyStore()

// Get filters from store
const filters = computed(() => propertyStore.filters)

// Local state for text input (for debouncing)
const communityNameInput = ref(filters.value.community_name || '')

// Local state for range inputs

const roomOptions = [1, 2, 3, 4, 5]
const floorLevelOptions = ['低楼层', '中楼层', '高楼层']
const roomsGteSelected = computed(() => (filters.value.rooms_gte ?? undefined) === 5)

const districtQuery = ref('')
const businessQuery = ref('')
const districtSuggestions = ref<string[]>([])
const businessSuggestions = ref<string[]>([])
const selectedDistricts = computed(() => filters.value.districts || [])
const selectedBusinessCircles = computed(() => filters.value.business_circles || [])

const priceInput = ref({ min: String(filters.value.min_price ?? 0), max: String(filters.value.max_price ?? 20000) })
const areaInput = ref({ min: String(filters.value.min_area ?? 0), max: String(filters.value.max_area ?? 300) })

const debouncedUpdateCommunityName = debounce((value: string) => {
  propertyStore.updateFilter('community_name', value)
}, 250)

const debouncedUpdatePriceRange = debounce((min: number, max: number) => {
  propertyStore.updateFilter('min_price', min)
  propertyStore.updateFilter('max_price', max)
  priceInput.value.min = String(min)
  priceInput.value.max = String(max)
}, 250)

const debouncedUpdateAreaRange = debounce((min: number, max: number) => {
  propertyStore.updateFilter('min_area', min)
  propertyStore.updateFilter('max_area', max)
  areaInput.value.min = String(min)
  areaInput.value.max = String(max)
}, 250)

const debouncedFetchDistricts = debounce(async (q: string) => {
  try {
    const resp = await fetchDictionary('district', q, 20)
    districtSuggestions.value = resp.items
  } catch {
    districtSuggestions.value = []
  }
}, 250)

const debouncedFetchBusiness = debounce(async (q: string) => {
  try {
    const resp = await fetchDictionary('business_circle', q, 20)
    businessSuggestions.value = resp.items
  } catch {
    businessSuggestions.value = []
  }
}, 250)

// Event handlers
const updateStatus = (status: '在售' | '成交' | null) => {
  propertyStore.updateFilter('status', status)
}

const handleCommunityNameChange = () => {
  debouncedUpdateCommunityName(communityNameInput.value)
}

// Removed slider handlers

const formatThousand = (val?: number) => {
  const n = Number(val ?? 0)
  return n.toLocaleString('zh-CN')
}

const sanitizeNumberInput = (s: string) => {
  const digits = s.replace(/[^\d]/g, '')
  return digits
}

const handlePriceInputChange = (field: 'min' | 'max') => {
  const raw = priceInput.value[field]
  const cleaned = sanitizeNumberInput(raw)
  priceInput.value[field] = cleaned
  let min = Number(priceInput.value.min || 0)
  let max = Number(priceInput.value.max || 0)
  if (min > max) {
    ;[min, max] = [max, min]
    priceInput.value.min = String(min)
    priceInput.value.max = String(max)
  }
  debouncedUpdatePriceRange(min, max)
}

const handleAreaInputChange = (field: 'min' | 'max') => {
  const raw = areaInput.value[field]
  const cleaned = sanitizeNumberInput(raw)
  areaInput.value[field] = cleaned
  let min = Number(areaInput.value.min || 0)
  let max = Number(areaInput.value.max || 0)
  if (min > max) {
    ;[min, max] = [max, min]
    areaInput.value.min = String(min)
    areaInput.value.max = String(max)
  }
  debouncedUpdateAreaRange(min, max)
}

const isFloorLevelSelected = (fl: string): boolean => {
  return (filters.value.floor_levels || []).includes(fl)
}

const toggleFloorLevel = (fl: string) => {
  const current = filters.value.floor_levels || []
  const exists = current.includes(fl)
  const updated = exists ? current.filter(x => x !== fl) : [...current, fl]
  propertyStore.updateFilter('floor_levels', updated)
}

// Orientation removed

const toggleRoomsGte = () => {
  const selected = roomsGteSelected.value
  propertyStore.updateFilter('rooms_gte', selected ? undefined : 5)
}

const handleDistrictQuery = () => {
  const q = districtQuery.value.trim()
  if (q) debouncedFetchDistricts(q)
  else districtSuggestions.value = []
}

const handleBusinessQuery = () => {
  const q = businessQuery.value.trim()
  if (q) debouncedFetchBusiness(q)
  else businessSuggestions.value = []
}

const addDistrict = (d: string) => {
  const current = filters.value.districts || []
  if (!current.includes(d)) {
    propertyStore.updateFilter('districts', [...current, d])
  }
  districtQuery.value = ''
  districtSuggestions.value = []
}

const addBusinessCircle = (b: string) => {
  const current = filters.value.business_circles || []
  if (!current.includes(b)) {
    propertyStore.updateFilter('business_circles', [...current, b])
  }
  businessQuery.value = ''
  businessSuggestions.value = []
}

const removeDistrict = (d: string) => {
  const current = filters.value.districts || []
  propertyStore.updateFilter('districts', current.filter(x => x !== d))
}

const removeBusinessCircle = (b: string) => {
  const current = filters.value.business_circles || []
  propertyStore.updateFilter('business_circles', current.filter(x => x !== b))
}

const clearAllArea = () => {
  propertyStore.updateFilter('districts', [])
  propertyStore.updateFilter('business_circles', [])
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
  priceInput.value = { min: '0', max: '20000' }
  areaInput.value = { min: '0', max: '300' }
  districtQuery.value = ''
  businessQuery.value = ''
  districtSuggestions.value = []
  businessSuggestions.value = []
}

// Watch for external changes to filters (e.g., from reset)
watch(() => filters.value.community_name, (newVal) => {
  if (newVal !== communityNameInput.value) {
    communityNameInput.value = newVal || ''
  }
})

watch(() => [filters.value.min_price, filters.value.max_price], ([newMin, newMax]) => {
  priceInput.value.min = String(newMin || 0)
  priceInput.value.max = String(newMax || 20000)
})

watch(() => [filters.value.min_area, filters.value.max_area], ([newMin, newMax]) => {
  areaInput.value.min = String(newMin || 0)
  areaInput.value.max = String(newMax || 300)
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

.range-input-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.5rem;
}

.range-input {
  display: flex;
  align-items: center;
  gap: 0.375rem;
}

.unit {
  font-size: 0.75rem;
  color: #6b7280;
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
/* sliders removed */

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

.district-bc-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
}

.combo-box {
  position: relative;
}

.suggestions {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 0.375rem;
  box-shadow: 0 8px 20px rgba(0,0,0,0.08);
  z-index: 20;
}

.suggestion-item {
  padding: 0.5rem 0.75rem;
  font-size: 0.875rem;
  color: #374151;
  cursor: pointer;
}

.suggestion-item:hover {
  background: #f3f4f6;
}

.selected-tags {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.tags-group {
  display: flex;
  align-items: center;
  gap: 0.375rem;
}

.tags-label {
  font-size: 0.75rem;
  color: #6b7280;
}

.tag {
  display: inline-flex;
  align-items: center;
  padding: 0.25rem 0.5rem;
  background: #eef2ff;
  color: #4338ca;
  border-radius: 9999px;
  font-size: 0.75rem;
  cursor: pointer;
}

.clear-tags {
  margin-left: auto;
  background: transparent;
  color: #ef4444;
  border: 1px solid #fecaca;
  border-radius: 0.375rem;
  padding: 0.25rem 0.5rem;
  font-size: 0.75rem;
}
</style>
.district-bc-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
}

@media (max-width: 640px) {
  .district-bc-row {
    grid-template-columns: 1fr;
  }
}
