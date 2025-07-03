<template>
  <div class="space-y-6">
    <!-- 页面标题和操作 -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold text-gray-900">房源管理</h1>
        <p class="mt-2 text-sm text-gray-600">管理所有房源信息</p>
      </div>
      <router-link
        to="/properties/new"
        class="btn-primary"
      >
        <PlusIcon class="h-5 w-5 mr-2" />
        新增房源
      </router-link>
    </div>

    <!-- 搜索和筛选 -->
    <div class="card">
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div>
          <label class="label">小区名称</label>
          <input
            v-model="filters.community_name"
            type="text"
            class="input-field"
            placeholder="搜索小区名称"
            @input="debouncedSearch"
          />
        </div>
        
        <div>
          <label class="label">房源状态</label>
          <select v-model="filters.status" class="input-field" @change="loadProperties">
            <option value="">全部状态</option>
            <option value="在售">在售</option>
            <option value="已成交">已成交</option>
            <option value="个人记录">个人记录</option>
            <option value="已下架">已下架</option>
          </select>
        </div>
        
        <div>
          <label class="label">价格范围（万元）</label>
          <div class="flex space-x-2">
            <input
              v-model="filters.min_price"
              type="number"
              class="input-field"
              placeholder="最低价"
              @change="loadProperties"
            />
            <input
              v-model="filters.max_price"
              type="number"
              class="input-field"
              placeholder="最高价"
              @change="loadProperties"
            />
          </div>
        </div>
        
        <div>
          <label class="label">面积范围（㎡）</label>
          <div class="flex space-x-2">
            <input
              v-model="filters.min_area"
              type="number"
              class="input-field"
              placeholder="最小面积"
              @change="loadProperties"
            />
            <input
              v-model="filters.max_area"
              type="number"
              class="input-field"
              placeholder="最大面积"
              @change="loadProperties"
            />
          </div>
        </div>
      </div>
      
      <div class="mt-4 flex justify-end space-x-2">
        <button @click="resetFilters" class="btn-secondary">
          重置筛选
        </button>
        <button @click="loadProperties" class="btn-primary">
          <MagnifyingGlassIcon class="h-4 w-4 mr-2" />
          搜索
        </button>
      </div>
    </div>

    <!-- 房源列表 -->
    <div class="card">
      <div class="overflow-hidden">
        <table class="min-w-full divide-y divide-gray-200">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                房源信息
              </th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                户型面积
              </th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                价格
              </th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                状态
              </th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                更新时间
              </th>
              <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                操作
              </th>
            </tr>
          </thead>
          <tbody class="bg-white divide-y divide-gray-200">
            <tr v-for="property in properties" :key="property.id" class="hover:bg-gray-50">
              <td class="px-6 py-4 whitespace-nowrap">
                <div>
                  <div class="text-sm font-medium text-gray-900">
                    {{ property.community_name || '未知小区' }}
                  </div>
                  <div class="text-sm text-gray-500">
                    {{ property.orientation || '' }} · {{ property.floor_level || '' }}
                  </div>
                </div>
              </td>
              <td class="px-6 py-4 whitespace-nowrap">
                <div class="text-sm text-gray-900">
                  {{ property.layout_bedrooms }}室{{ property.layout_living_rooms }}厅{{ property.layout_bathrooms }}卫
                </div>
                <div class="text-sm text-gray-500">
                  {{ property.area_sqm }}㎡
                </div>
              </td>
              <td class="px-6 py-4 whitespace-nowrap">
                <div class="text-sm font-medium text-gray-900">
                  {{ property.listing_price_wan || property.deal_price_wan || '-' }}万
                </div>
                <div v-if="property.deal_price_wan" class="text-sm text-gray-500">
                  成交价: {{ property.deal_price_wan }}万
                </div>
              </td>
              <td class="px-6 py-4 whitespace-nowrap">
                <span
                  class="inline-flex px-2 py-1 text-xs font-semibold rounded-full"
                  :class="getStatusClass(property.status)"
                >
                  {{ property.status }}
                </span>
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                {{ formatDate(property.updated_at) }}
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                <router-link
                  :to="`/properties/${property.id}`"
                  class="text-primary-600 hover:text-primary-900"
                >
                  查看
                </router-link>
                <router-link
                  :to="`/properties/${property.id}/edit`"
                  class="text-indigo-600 hover:text-indigo-900"
                >
                  编辑
                </router-link>
                <button
                  @click="deleteProperty(property)"
                  class="text-red-600 hover:text-red-900"
                >
                  删除
                </button>
              </td>
            </tr>
          </tbody>
        </table>
        
        <!-- 空状态 -->
        <div v-if="properties.length === 0 && !loading" class="text-center py-12">
          <BuildingOfficeIcon class="mx-auto h-12 w-12 text-gray-400" />
          <h3 class="mt-2 text-sm font-medium text-gray-900">暂无房源</h3>
          <p class="mt-1 text-sm text-gray-500">开始添加第一个房源吧</p>
          <div class="mt-6">
            <router-link to="/properties/new" class="btn-primary">
              <PlusIcon class="h-5 w-5 mr-2" />
              新增房源
            </router-link>
          </div>
        </div>
        
        <!-- 加载状态 -->
        <div v-if="loading" class="text-center py-12">
          <div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
          <p class="mt-2 text-sm text-gray-500">加载中...</p>
        </div>
      </div>
      
      <!-- 分页 -->
      <div v-if="properties.length > 0" class="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6">
        <div class="flex-1 flex justify-between sm:hidden">
          <button
            @click="prevPage"
            :disabled="currentPage === 1"
            class="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
          >
            上一页
          </button>
          <button
            @click="nextPage"
            :disabled="!hasNextPage"
            class="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
          >
            下一页
          </button>
        </div>
        <div class="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
          <div>
            <p class="text-sm text-gray-700">
              显示第 <span class="font-medium">{{ (currentPage - 1) * pageSize + 1 }}</span> 到 
              <span class="font-medium">{{ Math.min(currentPage * pageSize, totalCount) }}</span> 条，
              共 <span class="font-medium">{{ totalCount }}</span> 条记录
            </p>
          </div>
          <div>
            <nav class="relative z-0 inline-flex rounded-md shadow-sm -space-x-px">
              <button
                @click="prevPage"
                :disabled="currentPage === 1"
                class="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
              >
                <ChevronLeftIcon class="h-5 w-5" />
              </button>
              <button
                @click="nextPage"
                :disabled="!hasNextPage"
                class="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
              >
                <ChevronRightIcon class="h-5 w-5" />
              </button>
            </nav>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import {
  PlusIcon,
  MagnifyingGlassIcon,
  BuildingOfficeIcon,
  ChevronLeftIcon,
  ChevronRightIcon
} from '@heroicons/vue/24/outline'
import { propertyAPI } from '@/services/api'
import { debounce } from '@/utils/debounce'

const router = useRouter()
const properties = ref([])
const loading = ref(false)
const currentPage = ref(1)
const pageSize = ref(20)
const totalCount = ref(0)

const filters = reactive({
  community_name: '',
  status: '',
  min_price: '',
  max_price: '',
  min_area: '',
  max_area: '',
  bedrooms: ''
})

const hasNextPage = computed(() => {
  return currentPage.value * pageSize.value < totalCount.value
})

// 防抖搜索
const debouncedSearch = debounce(() => {
  currentPage.value = 1
  loadProperties()
}, 500)

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

// 加载房源列表
const loadProperties = async () => {
  try {
    loading.value = true
    const params = {
      page: currentPage.value,
      limit: pageSize.value,
      ...Object.fromEntries(
        Object.entries(filters).filter(([_, value]) => value !== '')
      )
    }
    
    const response = await propertyAPI.getProperties(params)
    properties.value = response.data
    // 注意：后端需要返回总数信息，这里暂时使用假数据
    totalCount.value = response.data.length >= pageSize.value ? 
      (currentPage.value * pageSize.value + 1) : 
      (currentPage.value - 1) * pageSize.value + response.data.length
  } catch (error) {
    console.error('Failed to load properties:', error)
  } finally {
    loading.value = false
  }
}

// 重置筛选
const resetFilters = () => {
  Object.keys(filters).forEach(key => {
    filters[key] = ''
  })
  currentPage.value = 1
  loadProperties()
}

// 分页
const prevPage = () => {
  if (currentPage.value > 1) {
    currentPage.value--
    loadProperties()
  }
}

const nextPage = () => {
  if (hasNextPage.value) {
    currentPage.value++
    loadProperties()
  }
}

// 删除房源
const deleteProperty = async (property) => {
  if (!confirm(`确定要删除房源"${property.community_name}"吗？`)) {
    return
  }
  
  try {
    await propertyAPI.deleteProperty(property.id)
    loadProperties()
  } catch (error) {
    console.error('Failed to delete property:', error)
    alert('删除失败，请重试')
  }
}

onMounted(() => {
  loadProperties()
})
</script>
