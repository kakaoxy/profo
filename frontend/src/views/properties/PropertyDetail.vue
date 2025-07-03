<template>
  <div v-if="property" class="space-y-6">
    <!-- 页面标题和操作 -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold text-gray-900">房源详情</h1>
        <p class="mt-2 text-sm text-gray-600">{{ property.community_name || '未知小区' }}</p>
      </div>
      <div class="flex space-x-3">
        <router-link
          :to="`/properties/${property.id}/edit`"
          class="btn-secondary"
        >
          <PencilIcon class="h-4 w-4 mr-2" />
          编辑
        </router-link>
        <button
          @click="deleteProperty"
          class="btn-danger"
        >
          <TrashIcon class="h-4 w-4 mr-2" />
          删除
        </button>
      </div>
    </div>

    <!-- 基本信息卡片 -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <!-- 主要信息 -->
      <div class="lg:col-span-2 space-y-6">
        <!-- 房源概览 -->
        <div class="card">
          <h3 class="text-lg font-medium text-gray-900 mb-4">房源概览</h3>
          <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div class="text-center p-4 bg-gray-50 rounded-lg">
              <div class="text-2xl font-bold text-gray-900">
                {{ property.layout_bedrooms || '-' }}
              </div>
              <div class="text-sm text-gray-500">卧室</div>
            </div>
            <div class="text-center p-4 bg-gray-50 rounded-lg">
              <div class="text-2xl font-bold text-gray-900">
                {{ property.layout_living_rooms || '-' }}
              </div>
              <div class="text-sm text-gray-500">客厅</div>
            </div>
            <div class="text-center p-4 bg-gray-50 rounded-lg">
              <div class="text-2xl font-bold text-gray-900">
                {{ property.layout_bathrooms || '-' }}
              </div>
              <div class="text-sm text-gray-500">卫生间</div>
            </div>
            <div class="text-center p-4 bg-gray-50 rounded-lg">
              <div class="text-2xl font-bold text-gray-900">
                {{ property.area_sqm || '-' }}
              </div>
              <div class="text-sm text-gray-500">建筑面积(㎡)</div>
            </div>
          </div>
        </div>

        <!-- 详细信息 -->
        <div class="card">
          <h3 class="text-lg font-medium text-gray-900 mb-4">详细信息</h3>
          <dl class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <dt class="text-sm font-medium text-gray-500">房屋朝向</dt>
              <dd class="mt-1 text-sm text-gray-900">{{ property.orientation || '-' }}</dd>
            </div>
            <div>
              <dt class="text-sm font-medium text-gray-500">楼层信息</dt>
              <dd class="mt-1 text-sm text-gray-900">
                {{ property.floor_level || '-' }}
                <span v-if="property.total_floors">（共{{ property.total_floors }}层）</span>
              </dd>
            </div>
            <div>
              <dt class="text-sm font-medium text-gray-500">建筑年代</dt>
              <dd class="mt-1 text-sm text-gray-900">{{ property.build_year || '-' }}</dd>
            </div>
            <div>
              <dt class="text-sm font-medium text-gray-500">房源状态</dt>
              <dd class="mt-1">
                <span
                  class="inline-flex px-2 py-1 text-xs font-semibold rounded-full"
                  :class="getStatusClass(property.status)"
                >
                  {{ property.status }}
                </span>
              </dd>
            </div>
            <div v-if="property.tags">
              <dt class="text-sm font-medium text-gray-500">标签</dt>
              <dd class="mt-1">
                <div class="flex flex-wrap gap-1">
                  <span
                    v-for="tag in property.tags.split(',')"
                    :key="tag"
                    class="inline-flex px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded-full"
                  >
                    {{ tag.trim() }}
                  </span>
                </div>
              </dd>
            </div>
            <div v-if="property.source_property_id">
              <dt class="text-sm font-medium text-gray-500">来源房源ID</dt>
              <dd class="mt-1 text-sm text-gray-900">{{ property.source_property_id }}</dd>
            </div>
          </dl>
        </div>

        <!-- 抵押信息 -->
        <div v-if="property.mortgage_info" class="card">
          <h3 class="text-lg font-medium text-gray-900 mb-4">抵押信息</h3>
          <p class="text-sm text-gray-700">{{ property.mortgage_info }}</p>
        </div>

        <!-- 链接信息 -->
        <div v-if="property.source_url || property.image_url" class="card">
          <h3 class="text-lg font-medium text-gray-900 mb-4">相关链接</h3>
          <div class="space-y-2">
            <div v-if="property.source_url">
              <a
                :href="property.source_url"
                target="_blank"
                class="text-primary-600 hover:text-primary-500 text-sm"
              >
                查看原始房源 ↗
              </a>
            </div>
            <div v-if="property.image_url">
              <a
                :href="property.image_url"
                target="_blank"
                class="text-primary-600 hover:text-primary-500 text-sm"
              >
                查看房源图片 ↗
              </a>
            </div>
          </div>
        </div>
      </div>

      <!-- 侧边栏 -->
      <div class="space-y-6">
        <!-- 价格信息 -->
        <div class="card">
          <h3 class="text-lg font-medium text-gray-900 mb-4">价格信息</h3>
          <div class="space-y-4">
            <div v-if="property.listing_price_wan">
              <div class="text-sm text-gray-500">挂牌价格</div>
              <div class="text-2xl font-bold text-gray-900">
                {{ property.listing_price_wan }}万
              </div>
              <div v-if="property.listing_date" class="text-sm text-gray-500">
                挂牌时间：{{ formatDate(property.listing_date) }}
              </div>
            </div>
            
            <div v-if="property.deal_price_wan" class="pt-4 border-t border-gray-200">
              <div class="text-sm text-gray-500">成交价格</div>
              <div class="text-2xl font-bold text-green-600">
                {{ property.deal_price_wan }}万
              </div>
              <div v-if="property.deal_date" class="text-sm text-gray-500">
                成交时间：{{ formatDate(property.deal_date) }}
              </div>
              <div v-if="property.deal_cycle_days" class="text-sm text-gray-500">
                成交周期：{{ property.deal_cycle_days }}天
              </div>
            </div>
            
            <!-- 单价计算 -->
            <div v-if="property.area_sqm && (property.listing_price_wan || property.deal_price_wan)" 
                 class="pt-4 border-t border-gray-200">
              <div class="text-sm text-gray-500">单价</div>
              <div class="text-lg font-medium text-gray-900">
                {{ calculateUnitPrice() }}元/㎡
              </div>
            </div>
          </div>
        </div>

        <!-- 操作按钮 -->
        <div class="card">
          <h3 class="text-lg font-medium text-gray-900 mb-4">快捷操作</h3>
          <div class="space-y-3">
            <router-link
              to="/my-viewings/new"
              class="w-full btn-primary text-center block"
            >
              <EyeIcon class="h-4 w-4 mr-2 inline" />
              添加看房笔记
            </router-link>
            <button
              @click="copyPropertyInfo"
              class="w-full btn-secondary"
            >
              <DocumentDuplicateIcon class="h-4 w-4 mr-2" />
              复制房源信息
            </button>
          </div>
        </div>

        <!-- 更新时间 -->
        <div class="card">
          <h3 class="text-lg font-medium text-gray-900 mb-4">记录信息</h3>
          <div class="space-y-2 text-sm text-gray-600">
            <div>创建时间：{{ formatDate(property.created_at) }}</div>
            <div>更新时间：{{ formatDate(property.updated_at) }}</div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- 加载状态 -->
  <div v-else-if="loading" class="flex items-center justify-center py-12">
    <div class="text-center">
      <div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      <p class="mt-2 text-sm text-gray-500">加载中...</p>
    </div>
  </div>

  <!-- 错误状态 -->
  <div v-else class="text-center py-12">
    <BuildingOfficeIcon class="mx-auto h-12 w-12 text-gray-400" />
    <h3 class="mt-2 text-sm font-medium text-gray-900">房源不存在</h3>
    <p class="mt-1 text-sm text-gray-500">该房源可能已被删除或不存在</p>
    <div class="mt-6">
      <router-link to="/properties" class="btn-primary">
        返回房源列表
      </router-link>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import {
  PencilIcon,
  TrashIcon,
  EyeIcon,
  DocumentDuplicateIcon,
  BuildingOfficeIcon
} from '@heroicons/vue/24/outline'
import { propertyAPI } from '@/services/api'

const router = useRouter()
const property = ref(null)
const loading = ref(true)

const props = defineProps({
  id: {
    type: String,
    required: true
  }
})

// 获取状态样式
const getStatusClass = (status) => {
  const classes = {
    '在售': 'bg-green-100 text-green-800',
    '已成交': 'bg-blue-100 text-blue-800',
    '个人记录': 'bg-yellow-100 text-yellow-800',
    '已下架': 'bg-gray-100 text-gray-800'
  }
  return classes[status] || 'bg-gray-100 text-gray-800'
}

// 格式化日期
const formatDate = (dateString) => {
  return new Date(dateString).toLocaleDateString()
}

// 计算单价
const calculateUnitPrice = () => {
  const price = property.value.deal_price_wan || property.value.listing_price_wan
  const area = property.value.area_sqm
  if (price && area) {
    return Math.round((price * 10000) / area)
  }
  return '-'
}

// 复制房源信息
const copyPropertyInfo = () => {
  const info = `
房源信息：
小区：${property.value.community_name || '-'}
户型：${property.value.layout_bedrooms}室${property.value.layout_living_rooms}厅${property.value.layout_bathrooms}卫
面积：${property.value.area_sqm}㎡
朝向：${property.value.orientation || '-'}
楼层：${property.value.floor_level || '-'}
价格：${property.value.listing_price_wan || property.value.deal_price_wan || '-'}万
状态：${property.value.status}
  `.trim()
  
  navigator.clipboard.writeText(info).then(() => {
    alert('房源信息已复制到剪贴板')
  }).catch(() => {
    alert('复制失败，请手动复制')
  })
}

// 删除房源
const deleteProperty = async () => {
  if (!confirm('确定要删除这个房源吗？此操作不可恢复。')) {
    return
  }
  
  try {
    await propertyAPI.deleteProperty(props.id)
    alert('房源删除成功')
    router.push('/properties')
  } catch (error) {
    console.error('Failed to delete property:', error)
    alert('删除失败，请重试')
  }
}

// 加载房源详情
const loadProperty = async () => {
  try {
    loading.value = true
    const response = await propertyAPI.getProperty(props.id)
    property.value = response.data
  } catch (error) {
    console.error('Failed to load property:', error)
    property.value = null
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  loadProperty()
})
</script>
