<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="visible" class="modal-overlay" @click="handleClose">
        <div class="modal-container" @click.stop>
          <div class="modal-header">
            <h2 class="modal-title">房源详情</h2>
            <button class="close-btn" @click="handleClose" title="关闭 (ESC)">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>

          <div v-if="property" class="modal-body">
            <!-- 基础信息 -->
            <section class="detail-section">
              <h3 class="section-title">基础信息</h3>
              <div class="detail-grid">
                <DetailItem label="数据来源" :value="property.data_source" />
                <DetailItem label="房源ID" :value="property.source_property_id" />
                <DetailItem label="小区名" :value="property.community_name" />
                <DetailItem label="物业类型" :value="property.property_type" />
                <DetailItem label="建筑年代" :value="property.build_year" />
                <DetailItem label="装修情况" :value="property.decoration" />
                <DetailItem label="电梯" :value="property.elevator" />
                <DetailItem label="产权类型" :value="property.ownership_type" />
                <DetailItem label="产权年限" :value="property.ownership_years" />
              </div>
            </section>

            <!-- 户型信息 -->
            <section class="detail-section">
              <h3 class="section-title">户型信息</h3>
              <div class="detail-grid">
                <DetailItem label="室" :value="property.rooms" />
                <DetailItem label="厅" :value="property.halls" />
                <DetailItem label="卫" :value="property.baths" />
                <DetailItem label="朝向" :value="property.orientation" />
                <DetailItem label="建筑面积" :value="property.build_area ? `${property.build_area.toFixed(1)} ㎡` : '-'" />
                <DetailItem label="楼层" :value="property.floor_original" />
                <DetailItem label="楼层级别" :value="property.floor_level" />
                <DetailItem 
                  label="楼层详情" 
                  :value="property.floor_number && property.total_floors ? `${property.floor_number}/${property.total_floors}` : '-'" 
                />
              </div>
            </section>

            <!-- 价格与时间 -->
            <section class="detail-section">
              <h3 class="section-title">价格与时间</h3>
              <div class="detail-grid">
                <DetailItem label="状态" :value="property.status">
                  <template #value>
                    <span :class="['status-badge', statusClass]">
                      {{ property.status }}
                    </span>
                  </template>
                </DetailItem>
                <DetailItem 
                  v-if="isForSale(property?.status)" 
                  label="挂牌价" 
                  :value="property.listed_price_wan ? `${property.listed_price_wan.toFixed(0)} 万` : '-'" 
                />
                <DetailItem 
                  v-if="isSold(property?.status)" 
                  label="成交价" 
                  :value="property.sold_price_wan ? `${property.sold_price_wan.toFixed(0)} 万` : '-'" 
                />
                <DetailItem 
                  v-if="!isForSale(property?.status) && !isSold(property?.status)" 
                  label="总价" 
                  :value="displayPriceWan !== null ? `${displayPriceWan.toFixed(0)} 万` : '-'" 
                />
                <DetailItem 
                  label="单价" 
                  :value="unitPrice !== null ? `${unitPrice.toFixed(0)} 元/㎡` : '-'" 
                />
                <DetailItem 
                  v-if="isForSale(property?.status)" 
                  label="上架时间" 
                  :value="formatDate(property.listed_date)" 
                />
                <DetailItem 
                  v-if="isSold(property?.status)" 
                  label="成交时间" 
                  :value="formatDate(property.sold_date)" 
                />
                <DetailItem 
                  v-if="property.transaction_duration_days" 
                  label="成交周期" 
                  :value="`${property.transaction_duration_days} 天`" 
                />
                <DetailItem label="上次交易" :value="property.last_transaction" />
              </div>
            </section>

            <!-- 其他信息 -->
            <section v-if="property.mortgage_info || property.listing_remarks" class="detail-section">
              <h3 class="section-title">其他信息</h3>
              <div class="detail-grid">
                <DetailItem label="抵押信息" :value="property.mortgage_info" />
                <DetailItem label="挂牌备注" :value="property.listing_remarks" class-name="col-span-2" />
              </div>
            </section>

            <!-- 系统信息 -->
            <section class="detail-section">
              <h3 class="section-title">系统信息</h3>
              <div class="detail-grid">
                <DetailItem label="创建时间" :value="formatDate(property.created_at)" />
                <DetailItem label="更新时间" :value="formatDate(property.updated_at)" />
              </div>
            </section>
          </div>

          <div v-else class="modal-body">
            <p class="text-gray-500">暂无数据</p>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { watch, onUnmounted, computed } from 'vue'
import type { Property } from '@/api/types'
import DetailItem from './DetailItem.vue'
import { isForSale, isSold, statusBadgeClass, getDisplayPriceWan, getUnitPriceYuanPerSqm } from '@/utils/price'

interface Props {
  visible: boolean
  property: Property | null
}

interface Emits {
  (e: 'update:visible', value: boolean): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const handleClose = () => {
  emit('update:visible', false)
}

const handleEscape = (event: KeyboardEvent) => {
  if (event.key === 'Escape' && props.visible) {
    handleClose()
  }
}

const formatDate = (dateString?: string): string => {
  if (!dateString) return '-'
  try {
    const date = new Date(dateString)
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  } catch {
    return dateString
  }
}

const statusClass = computed(() => statusBadgeClass(props.property?.status))
const displayPriceWan = computed(() => props.property ? getDisplayPriceWan(props.property) : null)
const unitPrice = computed(() => props.property ? getUnitPriceYuanPerSqm(props.property) : null)

// Add/remove escape key listener
watch(() => props.visible, (newVal: boolean) => {
  if (newVal) {
    document.addEventListener('keydown', handleEscape)
    document.body.style.overflow = 'hidden'
  } else {
    document.removeEventListener('keydown', handleEscape)
    document.body.style.overflow = ''
  }
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleEscape)
  document.body.style.overflow = ''
})
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 1rem;
}

.modal-container {
  background: white;
  border-radius: 0.5rem;
  max-width: 800px;
  width: 100%;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.5rem;
  border-bottom: 1px solid #e5e7eb;
}

.modal-title {
  font-size: 1.25rem;
  font-weight: 600;
  color: #111827;
  margin: 0;
}

.close-btn {
  width: 2rem;
  height: 2rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: #6b7280;
  cursor: pointer;
  border-radius: 0.375rem;
  transition: all 0.2s;
}

.close-btn:hover {
  background: #f3f4f6;
  color: #111827;
}

.close-btn svg {
  width: 1.25rem;
  height: 1.25rem;
}

.modal-body {
  flex: 1;
  overflow-y: auto;
  padding: 1.5rem;
}

.modal-body::-webkit-scrollbar {
  width: 8px;
}

.modal-body::-webkit-scrollbar-track {
  background: #f1f1f1;
}

.modal-body::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 4px;
}

.modal-body::-webkit-scrollbar-thumb:hover {
  background: #94a3b8;
}

.detail-section {
  margin-bottom: 2rem;
}

.detail-section:last-child {
  margin-bottom: 0;
}

.section-title {
  font-size: 1rem;
  font-weight: 600;
  color: #374151;
  margin: 0 0 1rem 0;
  padding-bottom: 0.5rem;
  border-bottom: 2px solid #e5e7eb;
}

.detail-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1rem;
}

.status-badge {
  padding: 0.25rem 0.75rem;
  border-radius: 0.375rem;
  font-size: 0.875rem;
  font-weight: 500;
  display: inline-block;
}

.status-for-sale {
  background: #dbeafe;
  color: #1e40af;
}

.status-sold {
  background: #d1fae5;
  color: #065f46;
}

/* Modal transitions */
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.3s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-active .modal-container,
.modal-leave-active .modal-container {
  transition: transform 0.3s ease;
}

.modal-enter-from .modal-container,
.modal-leave-to .modal-container {
  transform: scale(0.9);
}

@media (max-width: 768px) {
  .detail-grid {
    grid-template-columns: 1fr;
  }
}
</style>
