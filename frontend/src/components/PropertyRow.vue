<template>
  <div class="property-row">
    <div class="row-cell col-community_name" :title="property.community_name">
      {{ property.community_name }}
    </div>
    <div class="row-cell col-status">
      <span :class="['status-badge', statusClass]">
        {{ property.status }}
      </span>
    </div>
    <div class="row-cell col-rooms">
      {{ formatRoomType(property) }}
    </div>
    <div class="row-cell col-build_area">
      {{ property.build_area.toFixed(1) }}
    </div>
    <div class="row-cell col-floor_level" :title="property.floor_original">
      {{ formatFloor(property) }}
    </div>
    <div class="row-cell col-orientation">
      {{ property.orientation }}
    </div>
    <div class="row-cell col-total_price">
      {{ formatTotalPrice(property) }}
    </div>
    <div class="row-cell col-unit_price">
      {{ formatUnitPrice(property) }}
    </div>
    <div class="row-cell col-data_source">
      {{ property.data_source }}
    </div>
    <div class="row-cell col-actions">
      <button 
        class="view-btn"
        @click="$emit('view-detail', property)"
        title="查看详情"
      >
        查看
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { Property } from '@/api/types'
import { getDisplayPriceWan, getUnitPriceYuanPerSqm, statusBadgeClass } from '@/utils/price'

interface Props {
  property: Property
}

interface Emits {
  (e: 'view-detail', property: Property): void
}

const props = defineProps<Props>()
defineEmits<Emits>()

// Status badge class
const statusClass = computed(() => statusBadgeClass(props.property.status))

// Format room type (e.g., "3室2厅1卫")
const formatRoomType = (property: Property): string => {
  const parts = []
  if (property.rooms) parts.push(`${property.rooms}室`)
  if (property.halls) parts.push(`${property.halls}厅`)
  if (property.baths) parts.push(`${property.baths}卫`)
  return parts.join('') || '-'
}

// Format floor display
const formatFloor = (property: Property): string => {
  if (property.floor_level) {
    return property.floor_level
  }
  if (property.floor_number && property.total_floors) {
    return `${property.floor_number}/${property.total_floors}`
  }
  return property.floor_original || '-'
}

// Format total price based on status
const formatTotalPrice = (property: Property): string => {
  const price = getDisplayPriceWan(property)
  return price !== null ? price.toFixed(0) : '-'
}

// Format unit price
const formatUnitPrice = (property: Property): string => {
  const unit = getUnitPriceYuanPerSqm(property)
  return unit !== null ? unit.toFixed(0) : '-'
}
</script>

<style scoped>
.property-row {
  display: flex;
  border-bottom: 1px solid #e5e7eb;
  background: white;
  transition: all 0.2s ease;
  align-items: center;
}

.property-row:hover {
  background: #f9fafb;
  box-shadow: inset 0 0 0 1px #e5e7eb;
  transform: translateX(2px);
}

.row-cell {
  padding: 0.75rem;
  font-size: 0.875rem;
  color: #374151;
  border-right: 1px solid #e5e7eb;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: flex;
  align-items: center;
}

.row-cell:last-child {
  border-right: none;
}

/* Column widths - must match PropertyList columns */
.col-community_name { width: 150px; }
.col-status { width: 80px; justify-content: center; }
.col-rooms { width: 100px; }
.col-build_area { width: 100px; text-align: right; justify-content: flex-end; }
.col-floor_level { width: 100px; }
.col-orientation { width: 80px; }
.col-total_price { width: 100px; text-align: right; justify-content: flex-end; }
.col-unit_price { width: 120px; text-align: right; justify-content: flex-end; }
.col-data_source { width: 100px; }
.col-actions { width: 80px; justify-content: center; }

.status-badge {
  padding: 0.25rem 0.625rem;
  border-radius: 9999px;
  font-size: 0.75rem;
  font-weight: 600;
  display: inline-block;
  letter-spacing: 0.025em;
}

.status-for-sale {
  background: linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%);
  color: #1e40af;
  box-shadow: 0 1px 2px rgba(30, 64, 175, 0.2);
}

.status-sold {
  background: linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%);
  color: #065f46;
  box-shadow: 0 1px 2px rgba(6, 95, 70, 0.2);
}

.view-btn {
  padding: 0.375rem 0.875rem;
  background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
  color: white;
  border: none;
  border-radius: 0.375rem;
  font-size: 0.75rem;
  cursor: pointer;
  transition: all 0.2s ease;
  font-weight: 500;
  box-shadow: 0 2px 4px rgba(59, 130, 246, 0.3);
}

.view-btn:hover {
  background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
  box-shadow: 0 4px 8px rgba(59, 130, 246, 0.4);
  transform: translateY(-1px);
}

.view-btn:active {
  background: #1d4ed8;
  transform: translateY(0);
  box-shadow: 0 1px 2px rgba(59, 130, 246, 0.3);
}
</style>
