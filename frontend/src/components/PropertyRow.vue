<template>
  <div class="property-row">
    <div class="row-cell col-source_property_id" :title="property.source_property_id">
      {{ property.source_property_id }}
    </div>
    <div class="row-cell col-floor_plan" @mouseenter="handleMouseEnter" @mouseleave="handleMouseLeave">
      <div class="floor-thumb-container" ref="thumbContainer">
        <img
          :src="getFloorPlan(property)"
          alt="户型图"
          class="floor-thumb"
          @error="handleImageError"
          referrerpolicy="no-referrer"
        />
      </div>
    </div>
    <!-- 放大图片显示 - 使用Teleport渲染到body -->
    <Teleport to="body" v-if="showZoomedImage">
      <div class="zoomed-image-container" :style="zoomedImageStyle">
        <img :src="getFloorPlan(property)" alt="放大户型图" class="zoomed-image"/>
      </div>
    </Teleport>
    <div class="row-cell col-community_name" :title="property.community_name">
      {{ property.community_name }}
    </div>
    <div class="row-cell col-status">
      <span :class="['status-badge', statusClass]">
        {{ property.status }}
      </span>
    </div>
    <div class="row-cell col-district">
      {{ property.district || '-' }}
    </div>
    <div class="row-cell col-business_circle">
      {{ property.business_circle || '-' }}
    </div>
    <div class="row-cell col-rooms">
      {{ formatRoomType(property) }}
    </div>
    <div class="row-cell col-orientation">
      {{ property.orientation }}
    </div>
    <div class="row-cell col-floor_level" :title="property.floor_original">
      <span :class="floorBadgeClasses">{{ formatFloor(property) }}</span>
    </div>
    <div class="row-cell col-build_area">
      {{ property.build_area.toFixed(1) }}
    </div>
    <div class="row-cell col-total_price">
      {{ formatTotalPrice(property) }}
    </div>
    <div class="row-cell col-unit_price">
      {{ formatUnitPrice(property) }}
    </div>
    <div class="row-cell col-timeline">
      {{ formatTimeline(property) }}
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
import { computed, ref, nextTick, onMounted, onUnmounted } from 'vue'
import type { Property } from '@/api/types'
import { getDisplayPriceWan, getUnitPriceYuanPerSqm, statusBadgeClass } from '@/utils/price'

// 添加窗口大小变化监听
const handleResize = () => {
  if (showZoomedImage.value) {
    updateZoomedImagePosition();
  }
};

// 组件挂载时添加事件监听
onMounted(() => {
  window.addEventListener('resize', handleResize);
});

onUnmounted(() => {
  window.removeEventListener('resize', handleResize);
});

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

const formatTotalPrice = (property: Property): string => {
  const price = getDisplayPriceWan(property)
  return price !== null ? price.toFixed(0) : '-'
}

const formatUnitPrice = (property: Property): string => {
  const unit = getUnitPriceYuanPerSqm(property)
  return unit !== null ? unit.toFixed(0) : '-'
}

const formatTimeline = (property: Property): string => {
  const d = property.status === '在售' ? property.listed_date : property.sold_date || property.listed_date
  if (!d) return '-'
  const s = typeof d === 'string' ? d : new Date(d as any).toISOString()
  return s.slice(0, 10)
}

const placeholderImage = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="72" height="48"><rect width="72" height="48" fill="%23e5e7eb"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="%239ca3af" font-size="10">无图</text></svg>'

const showZoomedImage = ref(false);
const thumbContainer = ref<HTMLElement | null>(null);
const zoomedImageStyle = ref<Record<string, string>>({});

const handleMouseEnter = async () => {
  showZoomedImage.value = true;
  await nextTick();
  updateZoomedImagePosition();
};

const handleMouseLeave = () => {
  showZoomedImage.value = false;
};

const updateZoomedImagePosition = () => {
  if (!thumbContainer.value) return;
  
  const rect = thumbContainer.value.getBoundingClientRect();
  const viewportHeight = window.innerHeight;
  const viewportWidth = window.innerWidth;
  
  // 计算放大图片的位置（显示在户型图下方）
  let top = rect.bottom + 8; // 8px 间距
  let left = rect.left + rect.width / 2; // 水平居中
  
  // 检查下方空间是否足够，如果不够则显示在上方
  if (top + 600 > viewportHeight && rect.top > 600) {
    top = rect.top - 600 - 8; // 显示在上方
  }
  
  // 确保不超出视口边界
  left = Math.max(10, Math.min(left, viewportWidth - 610));
  
  zoomedImageStyle.value = {
    position: 'fixed',
    top: `${top}px`,
    left: `${left}px`,
    transform: 'translateX(-50%)',
    zIndex: '9999'
  };
};

const getFloorPlan = (property: Property): string => {
  console.log('>>> data_source:', property.data_source)
  console.log('>>> picture_links:', property.picture_links)
  
  // 如果没有图片链接，返回占位图
  if (!property.picture_links || property.picture_links.length === 0) {
    return placeholderImage
  }
  
  const dataSource = property.data_source
  let imageUrl: string
  
  // 根据数据源选择户型图
  if (dataSource === '贝壳') {
    // 贝壳：优先取包含 'hdic-frame' 的图片链接，并添加CDN参数
    const hdicFrameImage = property.picture_links.find(link =>
      link.toLowerCase().includes('hdic-frame')
    );
    imageUrl = hdicFrameImage || property.picture_links[2] || property.picture_links[0];
    if (imageUrl && !imageUrl.includes('!m_fill')) {
      imageUrl += '!m_fill,w_1000,h_750,l_bk,f_jpg,ls_50'
    }
  } else if (dataSource === '我爱我家') {
    // 我爱我家：优先取包含 'floorPlan' 的图片链接
    const floorPlanImage = property.picture_links.find(link =>
      link.toLowerCase().includes('floorplan') || link.toLowerCase().includes('layout')
    );
    imageUrl = floorPlanImage || property.picture_links[property.picture_links.length - 1];
  } else {
    // 其他来源：默认显示第一张图
    imageUrl = property.picture_links[0]
  }
  
  console.log('>>> finalimage:', imageUrl)
  return imageUrl || placeholderImage
}

const handleImageError = (event: Event) => {
  const img = event.target as HTMLImageElement
  img.src = placeholderImage
}

const floorBadgeClasses = computed(() => {
  const lvl = (props.property.floor_level || '').trim()
  let variant = 'floor-mid'
  if (lvl.includes('低')) variant = 'floor-low'
  else if (lvl.includes('高')) variant = 'floor-high'
  const disabled = (props.property as any).is_active === false
  return ['status-badge', variant, disabled ? 'badge-disabled' : '']
})
</script>

<style scoped>
.property-row { display: flex; border-bottom: 1px solid #e5e7eb; background: white; transition: all 0.2s ease; align-items: center; }
.property-row:hover { background: #f9fafb; box-shadow: inset 0 0 0 1px #e5e7eb; transform: translateX(2px); }
.row-cell { padding: 0.75rem; font-size: 0.875rem; color: #374151; border-right: 1px solid #e5e7eb; overflow: visible; text-overflow: ellipsis; white-space: nowrap; display: flex; align-items: center; position: relative; }
.row-cell:last-child { border-right: none; }
.col-source_property_id { width: 120px; }
.col-floor_plan { width: 80px; justify-content: center; overflow: visible; }
.col-community_name { width: 150px; }
.col-status { width: 80px; justify-content: center; }
.col-district { width: 100px; }
.col-business_circle { width: 120px; }
.col-rooms { width: 100px; }
.col-orientation { width: 80px; }
.col-floor_level { width: 100px; }
.col-build_area { width: 100px; text-align: right; justify-content: flex-end; }
.col-total_price { width: 100px; text-align: right; justify-content: flex-end; }
.col-unit_price { width: 120px; text-align: right; justify-content: flex-end; }
.col-timeline { width: 140px; }
.col-data_source { width: 100px; }
.col-actions { width: 80px; justify-content: center; }
.status-badge { padding: 0.25rem 0.625rem; border-radius: 9999px; font-size: 0.75rem; font-weight: 600; display: inline-block; letter-spacing: 0.025em; border: 1px solid rgba(0,0,0,0.06); transition: background-color 0.2s ease, color 0.2s ease, box-shadow 0.2s ease, transform 0.1s ease; }
.status-for-sale { background: linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%); color: #1e40af; box-shadow: 0 1px 2px rgba(30, 64, 175, 0.2); }
.status-sold { background: linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%); color: #065f46; box-shadow: 0 1px 2px rgba(6, 95, 70, 0.2); }
.status-badge:hover { filter: brightness(0.98); }
.status-badge:active { transform: scale(0.98); }
.badge-disabled { background: #e5e7eb !important; color: #6b7280 !important; box-shadow: none !important; cursor: not-allowed; opacity: 0.75; }
.floor-low { background: linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%); color: #065f46; box-shadow: 0 1px 2px rgba(6, 95, 70, 0.2); }
.floor-mid { background: linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%); color: #374151; box-shadow: 0 1px 2px rgba(55, 65, 81, 0.15); }
.floor-high { background: linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%); color: #1e40af; box-shadow: 0 1px 2px rgba(30, 64, 175, 0.2); }
.floor-thumb { width: 72px; height: 48px; object-fit: cover; border-radius: 4px; border: 1px solid #e5e7eb; }
.view-btn { padding: 0.375rem 0.875rem; background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); color: white; border: none; border-radius: 0.375rem; font-size: 0.75rem; cursor: pointer; transition: all 0.2s ease; font-weight: 500; box-shadow: 0 2px 4px rgba(59, 130, 246, 0.3); }
.view-btn:hover { background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); box-shadow: 0 4px 8px rgba(59, 130, 246, 0.4); transform: translateY(-1px); }
.view-btn:active { background: #1d4ed8; transform: translateY(0); box-shadow: 0 1px 2px rgba(59, 130, 246, 0.3); }
/* 户型图悬停放大容器 */
.floor-thumb-container {
  width: 72px;
  height: 48px;
  border-radius: 4px;
  border: 1px solid #e5e7eb;
  position: relative; /* 添加相对定位，使子元素能相对于它定位 */
}

.zoomed-image-container {
  background-color: white;
  padding: 15px;
  box-shadow: 0 8px 16px rgba(0,0,0,0.3);
  border-radius: 8px;
  pointer-events: none;
  max-width: 600px;
  max-height: 600px;
}
.zoomed-image {
  max-width: 600px;
  max-height: 600px;
  object-fit: contain;
  border-radius: 4px;
}
</style>
