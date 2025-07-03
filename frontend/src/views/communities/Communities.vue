<template>
  <div class="space-y-6">
    <!-- 页面标题 -->
    <div>
      <h1 class="text-2xl font-bold text-gray-900">小区分析</h1>
      <p class="mt-2 text-sm text-gray-600">查看和对比不同小区的统计数据</p>
    </div>

    <!-- 搜索和筛选 -->
    <div class="card">
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label class="label">小区名称</label>
          <input
            v-model="filters.name"
            type="text"
            class="input-field"
            placeholder="搜索小区名称"
            @input="debouncedSearch"
          />
        </div>
        
        <div>
          <label class="label">城市</label>
          <select v-model="filters.city_id" class="input-field" @change="loadCommunities">
            <option value="">全部城市</option>
            <option
              v-for="city in cities"
              :key="city.id"
              :value="city.id"
            >
              {{ city.name }}
            </option>
          </select>
        </div>
        
        <div class="flex items-end">
          <button @click="resetFilters" class="btn-secondary mr-2">
            重置
          </button>
          <button @click="loadCommunities" class="btn-primary">
            <MagnifyingGlassIcon class="h-4 w-4 mr-2" />
            搜索
          </button>
        </div>
      </div>
    </div>

    <!-- 小区列表 -->
    <div class="card">
      <div class="overflow-hidden">
        <table class="min-w-full divide-y divide-gray-200">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                小区信息
              </th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                位置
              </th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                建筑信息
              </th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                统计数据
              </th>
              <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                操作
              </th>
            </tr>
          </thead>
          <tbody class="bg-white divide-y divide-gray-200">
            <tr v-for="community in communities" :key="community.id" class="hover:bg-gray-50">
              <td class="px-6 py-4 whitespace-nowrap">
                <div>
                  <div class="text-sm font-medium text-gray-900">
                    {{ community.name }}
                  </div>
                  <div class="text-sm text-gray-500">
                    {{ community.developer || '开发商未知' }}
                  </div>
                </div>
              </td>
              <td class="px-6 py-4 whitespace-nowrap">
                <div class="text-sm text-gray-900">
                  {{ community.district || '-' }}
                </div>
                <div class="text-sm text-gray-500">
                  {{ community.address || '-' }}
                </div>
              </td>
              <td class="px-6 py-4 whitespace-nowrap">
                <div class="text-sm text-gray-900">
                  {{ community.build_year || '-' }}年建成
                </div>
                <div class="text-sm text-gray-500">
                  {{ community.total_buildings || '-' }}栋 · {{ community.total_units || '-' }}户
                </div>
              </td>
              <td class="px-6 py-4 whitespace-nowrap">
                <div class="text-sm text-gray-900">
                  均价: {{ community.avg_price || '-' }}万/㎡
                </div>
                <div class="text-sm text-gray-500">
                  在售: {{ community.on_sale_count || 0 }}套
                </div>
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                <router-link
                  :to="`/communities/${community.id}`"
                  class="text-primary-600 hover:text-primary-900"
                >
                  查看详情
                </router-link>
              </td>
            </tr>
          </tbody>
        </table>
        
        <!-- 空状态 -->
        <div v-if="communities.length === 0 && !loading" class="text-center py-12">
          <BuildingOffice2Icon class="mx-auto h-12 w-12 text-gray-400" />
          <h3 class="mt-2 text-sm font-medium text-gray-900">暂无小区数据</h3>
          <p class="mt-1 text-sm text-gray-500">请尝试调整搜索条件</p>
        </div>
        
        <!-- 加载状态 -->
        <div v-if="loading" class="text-center py-12">
          <div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
          <p class="mt-2 text-sm text-gray-500">加载中...</p>
        </div>
      </div>
      
      <!-- 分页 -->
      <div v-if="communities.length > 0" class="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6">
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

    <!-- 统计概览 -->
    <div class="grid grid-cols-1 md:grid-cols-4 gap-6">
      <div class="card text-center">
        <div class="text-2xl font-bold text-gray-900">{{ totalCommunities }}</div>
        <div class="text-sm text-gray-500">小区总数</div>
      </div>
      <div class="card text-center">
        <div class="text-2xl font-bold text-blue-600">{{ avgPrice }}</div>
        <div class="text-sm text-gray-500">平均单价(万/㎡)</div>
      </div>
      <div class="card text-center">
        <div class="text-2xl font-bold text-green-600">{{ totalOnSale }}</div>
        <div class="text-sm text-gray-500">在售房源</div>
      </div>
      <div class="card text-center">
        <div class="text-2xl font-bold text-purple-600">{{ totalSold }}</div>
        <div class="text-sm text-gray-500">已售房源</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, computed } from 'vue'
import {
  MagnifyingGlassIcon,
  BuildingOffice2Icon,
  ChevronLeftIcon,
  ChevronRightIcon
} from '@heroicons/vue/24/outline'
import { communityAPI, cityAPI } from '@/services/api'
import { debounce } from '@/utils/debounce'

const communities = ref([])
const cities = ref([])
const loading = ref(false)
const currentPage = ref(1)
const pageSize = ref(20)
const totalCount = ref(0)

const filters = reactive({
  name: '',
  city_id: ''
})

// 统计数据
const totalCommunities = ref(0)
const avgPrice = ref(0)
const totalOnSale = ref(0)
const totalSold = ref(0)

const hasNextPage = computed(() => {
  return currentPage.value * pageSize.value < totalCount.value
})

// 防抖搜索
const debouncedSearch = debounce(() => {
  currentPage.value = 1
  loadCommunities()
}, 500)

// 加载城市列表
const loadCities = async () => {
  try {
    const response = await cityAPI.getCities()
    cities.value = response.data
  } catch (error) {
    console.error('Failed to load cities:', error)
  }
}

// 加载小区列表
const loadCommunities = async () => {
  try {
    loading.value = true
    const params = {
      page: currentPage.value,
      limit: pageSize.value,
      ...Object.fromEntries(
        Object.entries(filters).filter(([_, value]) => value !== '')
      )
    }
    
    const response = await communityAPI.getCommunities(params)
    communities.value = response.data
    
    // 计算统计数据
    calculateStats()
    
    // 注意：后端需要返回总数信息，这里暂时使用假数据
    totalCount.value = response.data.length >= pageSize.value ? 
      (currentPage.value * pageSize.value + 1) : 
      (currentPage.value - 1) * pageSize.value + response.data.length
  } catch (error) {
    console.error('Failed to load communities:', error)
  } finally {
    loading.value = false
  }
}

// 计算统计数据
const calculateStats = () => {
  totalCommunities.value = communities.value.length
  
  if (communities.value.length > 0) {
    const prices = communities.value
      .map(c => c.avg_price)
      .filter(p => p && p > 0)
    
    avgPrice.value = prices.length > 0 
      ? (prices.reduce((sum, price) => sum + price, 0) / prices.length).toFixed(2)
      : 0
    
    totalOnSale.value = communities.value
      .reduce((sum, c) => sum + (c.on_sale_count || 0), 0)
    
    totalSold.value = communities.value
      .reduce((sum, c) => sum + (c.sold_count || 0), 0)
  } else {
    avgPrice.value = 0
    totalOnSale.value = 0
    totalSold.value = 0
  }
}

// 重置筛选
const resetFilters = () => {
  Object.keys(filters).forEach(key => {
    filters[key] = ''
  })
  currentPage.value = 1
  loadCommunities()
}

// 分页
const prevPage = () => {
  if (currentPage.value > 1) {
    currentPage.value--
    loadCommunities()
  }
}

const nextPage = () => {
  if (hasNextPage.value) {
    currentPage.value++
    loadCommunities()
  }
}

onMounted(() => {
  loadCities()
  loadCommunities()
})
</script>
