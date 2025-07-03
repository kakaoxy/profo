<template>
  <div v-if="community" class="space-y-6">
    <!-- 页面标题 -->
    <div>
      <nav class="flex" aria-label="Breadcrumb">
        <ol class="flex items-center space-x-4">
          <li>
            <router-link to="/communities" class="text-gray-400 hover:text-gray-500">
              小区分析
            </router-link>
          </li>
          <li>
            <ChevronRightIcon class="h-5 w-5 text-gray-400" />
          </li>
          <li>
            <span class="text-gray-500">{{ community.name }}</span>
          </li>
        </ol>
      </nav>
      <h1 class="mt-4 text-2xl font-bold text-gray-900">{{ community.name }}</h1>
      <p class="mt-2 text-sm text-gray-600">{{ community.address || '地址未知' }}</p>
    </div>

    <!-- 基本信息 -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <!-- 主要信息 -->
      <div class="lg:col-span-2 space-y-6">
        <!-- 小区概览 -->
        <div class="card">
          <h3 class="text-lg font-medium text-gray-900 mb-4">小区概览</h3>
          <dl class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <dt class="text-sm font-medium text-gray-500">所属城市</dt>
              <dd class="mt-1 text-sm text-gray-900">{{ community.city_name || '-' }}</dd>
            </div>
            <div>
              <dt class="text-sm font-medium text-gray-500">所属区域</dt>
              <dd class="mt-1 text-sm text-gray-900">{{ community.district || '-' }}</dd>
            </div>
            <div>
              <dt class="text-sm font-medium text-gray-500">开发商</dt>
              <dd class="mt-1 text-sm text-gray-900">{{ community.developer || '-' }}</dd>
            </div>
            <div>
              <dt class="text-sm font-medium text-gray-500">建成年份</dt>
              <dd class="mt-1 text-sm text-gray-900">{{ community.build_year || '-' }}</dd>
            </div>
            <div>
              <dt class="text-sm font-medium text-gray-500">总楼栋数</dt>
              <dd class="mt-1 text-sm text-gray-900">{{ community.total_buildings || '-' }}栋</dd>
            </div>
            <div>
              <dt class="text-sm font-medium text-gray-500">总户数</dt>
              <dd class="mt-1 text-sm text-gray-900">{{ community.total_units || '-' }}户</dd>
            </div>
            <div>
              <dt class="text-sm font-medium text-gray-500">物业公司</dt>
              <dd class="mt-1 text-sm text-gray-900">{{ community.property_company || '-' }}</dd>
            </div>
            <div>
              <dt class="text-sm font-medium text-gray-500">物业费</dt>
              <dd class="mt-1 text-sm text-gray-900">
                {{ community.property_fee ? `${community.property_fee}元/㎡/月` : '-' }}
              </dd>
            </div>
          </dl>
        </div>

        <!-- 价格趋势图 -->
        <div class="card">
          <div class="flex items-center justify-between mb-6">
            <h3 class="text-lg font-medium text-gray-900">价格趋势</h3>
            <div class="flex space-x-2">
              <button
                v-for="period in periods"
                :key="period.value"
                @click="selectedPeriod = period.value; loadTrendData()"
                class="px-3 py-1 text-sm rounded-md transition-colors"
                :class="selectedPeriod === period.value 
                  ? 'bg-primary-100 text-primary-700' 
                  : 'text-gray-500 hover:text-gray-700'"
              >
                {{ period.label }}
              </button>
            </div>
          </div>
          
          <div class="h-80">
            <Line
              v-if="chartData"
              :data="chartData"
              :options="chartOptions"
            />
            <div v-else class="flex items-center justify-center h-full text-gray-500">
              <div class="text-center">
                <ChartBarIcon class="h-12 w-12 mx-auto mb-2 text-gray-300" />
                <p>暂无趋势数据</p>
              </div>
            </div>
          </div>
        </div>

        <!-- 房源列表 -->
        <div class="card">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-lg font-medium text-gray-900">该小区房源</h3>
            <router-link
              to="/properties"
              class="text-sm text-primary-600 hover:text-primary-500"
            >
              查看全部 →
            </router-link>
          </div>
          
          <div class="space-y-3">
            <div
              v-for="property in properties"
              :key="property.id"
              class="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
            >
              <div>
                <p class="font-medium text-gray-900">
                  {{ property.layout_bedrooms }}室{{ property.layout_living_rooms }}厅{{ property.layout_bathrooms }}卫
                </p>
                <p class="text-sm text-gray-500">
                  {{ property.area_sqm }}㎡ · {{ property.orientation || '' }} · {{ property.floor_level || '' }}
                </p>
              </div>
              <div class="text-right">
                <p class="font-medium text-gray-900">{{ property.listing_price_wan || property.deal_price_wan }}万</p>
                <span
                  class="inline-flex px-2 py-1 text-xs font-semibold rounded-full"
                  :class="getStatusClass(property.status)"
                >
                  {{ property.status }}
                </span>
              </div>
            </div>
            
            <div v-if="properties.length === 0" class="text-center py-4 text-gray-500">
              该小区暂无房源记录
            </div>
          </div>
        </div>
      </div>

      <!-- 侧边栏 -->
      <div class="space-y-6">
        <!-- 统计数据 -->
        <div class="card">
          <h3 class="text-lg font-medium text-gray-900 mb-4">统计数据</h3>
          <div class="space-y-4">
            <div class="text-center p-4 bg-blue-50 rounded-lg">
              <div class="text-2xl font-bold text-blue-600">
                {{ community.avg_price || '-' }}
              </div>
              <div class="text-sm text-blue-700">平均单价(万/㎡)</div>
            </div>
            
            <div class="grid grid-cols-2 gap-3">
              <div class="text-center p-3 bg-green-50 rounded-lg">
                <div class="text-lg font-bold text-green-600">
                  {{ community.on_sale_count || 0 }}
                </div>
                <div class="text-xs text-green-700">在售</div>
              </div>
              <div class="text-center p-3 bg-gray-50 rounded-lg">
                <div class="text-lg font-bold text-gray-600">
                  {{ community.sold_count || 0 }}
                </div>
                <div class="text-xs text-gray-700">已售</div>
              </div>
            </div>
            
            <div class="grid grid-cols-2 gap-3">
              <div class="text-center p-3 bg-purple-50 rounded-lg">
                <div class="text-lg font-bold text-purple-600">
                  {{ community.viewing_count || 0 }}
                </div>
                <div class="text-xs text-purple-700">带看次数</div>
              </div>
              <div class="text-center p-3 bg-orange-50 rounded-lg">
                <div class="text-lg font-bold text-orange-600">
                  {{ community.avg_deal_days || '-' }}
                </div>
                <div class="text-xs text-orange-700">平均成交周期</div>
              </div>
            </div>
          </div>
        </div>

        <!-- 周边配套 -->
        <div v-if="community.facilities" class="card">
          <h3 class="text-lg font-medium text-gray-900 mb-4">周边配套</h3>
          <div class="space-y-2 text-sm text-gray-600">
            <div v-for="facility in community.facilities.split(',')" :key="facility">
              {{ facility.trim() }}
            </div>
          </div>
        </div>

        <!-- 交通信息 -->
        <div v-if="community.transportation" class="card">
          <h3 class="text-lg font-medium text-gray-900 mb-4">交通信息</h3>
          <p class="text-sm text-gray-600">{{ community.transportation }}</p>
        </div>

        <!-- 快捷操作 -->
        <div class="card">
          <h3 class="text-lg font-medium text-gray-900 mb-4">快捷操作</h3>
          <div class="space-y-3">
            <router-link
              to="/properties/new"
              class="w-full btn-primary text-center block"
            >
              <PlusIcon class="h-4 w-4 mr-2 inline" />
              添加房源
            </router-link>
            <router-link
              to="/my-viewings/new"
              class="w-full btn-secondary text-center block"
            >
              <EyeIcon class="h-4 w-4 mr-2 inline" />
              添加看房笔记
            </router-link>
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
    <BuildingOffice2Icon class="mx-auto h-12 w-12 text-gray-400" />
    <h3 class="mt-2 text-sm font-medium text-gray-900">小区不存在</h3>
    <p class="mt-1 text-sm text-gray-500">该小区可能已被删除或不存在</p>
    <div class="mt-6">
      <router-link to="/communities" class="btn-primary">
        返回小区列表
      </router-link>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { Line } from 'vue-chartjs'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js'
import {
  ChevronRightIcon,
  ChartBarIcon,
  PlusIcon,
  EyeIcon,
  BuildingOffice2Icon
} from '@heroicons/vue/24/outline'
import { communityAPI, propertyAPI } from '@/services/api'

// 注册Chart.js组件
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
)

const community = ref(null)
const properties = ref([])
const loading = ref(true)
const trendData = ref(null)
const selectedPeriod = ref(6)

const props = defineProps({
  id: {
    type: String,
    required: true
  }
})

const periods = [
  { label: '3个月', value: 3 },
  { label: '6个月', value: 6 },
  { label: '1年', value: 12 }
]

// 图表数据
const chartData = computed(() => {
  if (!trendData.value) return null
  
  // 这里应该使用真实的趋势数据
  // 暂时使用模拟数据
  const months = []
  const prices = []
  
  for (let i = selectedPeriod.value; i >= 0; i--) {
    const date = new Date()
    date.setMonth(date.getMonth() - i)
    months.push(date.toLocaleDateString('zh-CN', { year: 'numeric', month: 'short' }))
    prices.push(Math.random() * 10 + 40) // 模拟价格数据
  }
  
  return {
    labels: months,
    datasets: [
      {
        label: '平均单价(万/㎡)',
        data: prices,
        borderColor: 'rgb(59, 130, 246)',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        tension: 0.4
      }
    ]
  }
})

// 图表配置
const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      position: 'top'
    },
    title: {
      display: false
    }
  },
  scales: {
    y: {
      beginAtZero: false
    }
  }
}

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

// 加载小区详情
const loadCommunity = async () => {
  try {
    const response = await communityAPI.getCommunity(props.id)
    community.value = response.data
  } catch (error) {
    console.error('Failed to load community:', error)
    community.value = null
  }
}

// 加载该小区的房源
const loadProperties = async () => {
  try {
    const response = await propertyAPI.getProperties({
      community_id: props.id,
      limit: 10
    })
    properties.value = response.data
  } catch (error) {
    console.error('Failed to load properties:', error)
  }
}

// 加载趋势数据
const loadTrendData = async () => {
  try {
    // 这里应该调用获取小区价格趋势的API
    // 暂时使用模拟数据
    trendData.value = { mock: true }
  } catch (error) {
    console.error('Failed to load trend data:', error)
  }
}

onMounted(async () => {
  loading.value = true
  await Promise.all([
    loadCommunity(),
    loadProperties(),
    loadTrendData()
  ])
  loading.value = false
})
</script>
