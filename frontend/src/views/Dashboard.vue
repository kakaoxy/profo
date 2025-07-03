<template>
  <div class="space-y-8">
    <!-- 页面标题 -->
    <div>
      <h1 class="text-2xl font-bold text-gray-900">数据看板</h1>
      <p class="mt-2 text-sm text-gray-600">房源信息概览和趋势分析</p>
    </div>

    <!-- 核心指标卡片 -->
    <div class="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
      <div class="card">
        <div class="flex items-center">
          <div class="flex-shrink-0">
            <HomeIcon class="h-8 w-8 text-blue-600" />
          </div>
          <div class="ml-4">
            <p class="text-sm font-medium text-gray-500">昨日新房成交</p>
            <p class="text-2xl font-bold text-gray-900">
              {{ overview?.latest_city_stats?.new_deal_units || 0 }}
              <span class="text-sm font-normal text-gray-500">套</span>
            </p>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="flex items-center">
          <div class="flex-shrink-0">
            <BuildingOfficeIcon class="h-8 w-8 text-green-600" />
          </div>
          <div class="ml-4">
            <p class="text-sm font-medium text-gray-500">昨日二手房成交</p>
            <p class="text-2xl font-bold text-gray-900">
              {{ overview?.latest_city_stats?.secondhand_deal_units || 0 }}
              <span class="text-sm font-normal text-gray-500">套</span>
            </p>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="flex items-center">
          <div class="flex-shrink-0">
            <ChartBarIcon class="h-8 w-8 text-purple-600" />
          </div>
          <div class="ml-4">
            <p class="text-sm font-medium text-gray-500">房源总数</p>
            <p class="text-2xl font-bold text-gray-900">
              {{ overview?.property_stats?.total || 0 }}
              <span class="text-sm font-normal text-gray-500">套</span>
            </p>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="flex items-center">
          <div class="flex-shrink-0">
            <EyeIcon class="h-8 w-8 text-orange-600" />
          </div>
          <div class="ml-4">
            <p class="text-sm font-medium text-gray-500">我的看房记录</p>
            <p class="text-2xl font-bold text-gray-900">
              {{ overview?.viewing_stats?.total || 0 }}
              <span class="text-sm font-normal text-gray-500">次</span>
            </p>
          </div>
        </div>
      </div>
    </div>

    <!-- 交易趋势图表 -->
    <div class="card">
      <div class="flex items-center justify-between mb-6">
        <h3 class="text-lg font-medium text-gray-900">交易趋势</h3>
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
            <p>暂无数据</p>
          </div>
        </div>
      </div>
    </div>

    <!-- 近期动态 -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <!-- 最近房源 -->
      <div class="card">
        <h3 class="text-lg font-medium text-gray-900 mb-4">最近房源</h3>
        <div class="space-y-3">
          <div
            v-for="property in recentProperties"
            :key="property.id"
            class="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
          >
            <div>
              <p class="font-medium text-gray-900">{{ property.community_name }}</p>
              <p class="text-sm text-gray-500">
                {{ property.layout_bedrooms }}室{{ property.layout_living_rooms }}厅 
                · {{ property.area_sqm }}㎡
              </p>
            </div>
            <div class="text-right">
              <p class="font-medium text-gray-900">{{ property.listing_price_wan }}万</p>
              <p class="text-sm text-gray-500">{{ formatDate(property.created_at) }}</p>
            </div>
          </div>
          
          <div v-if="recentProperties.length === 0" class="text-center py-4 text-gray-500">
            暂无房源记录
          </div>
          
          <div class="pt-2">
            <router-link
              to="/properties"
              class="text-sm text-primary-600 hover:text-primary-500 font-medium"
            >
              查看全部房源 →
            </router-link>
          </div>
        </div>
      </div>

      <!-- 最近看房笔记 -->
      <div class="card">
        <h3 class="text-lg font-medium text-gray-900 mb-4">最近看房笔记</h3>
        <div class="space-y-3">
          <div
            v-for="viewing in recentViewings"
            :key="viewing.id"
            class="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
          >
            <div>
              <p class="font-medium text-gray-900">{{ viewing.property_name }}</p>
              <div class="flex items-center mt-1">
                <div class="flex items-center">
                  <StarIcon
                    v-for="i in 5"
                    :key="i"
                    class="h-4 w-4"
                    :class="i <= (viewing.rating || 0) ? 'text-yellow-400' : 'text-gray-300'"
                  />
                </div>
                <span class="ml-2 text-sm text-gray-500">{{ viewing.rating || 0 }}分</span>
              </div>
            </div>
            <div class="text-right">
              <p class="text-sm text-gray-500">{{ formatDate(viewing.viewing_date) }}</p>
            </div>
          </div>
          
          <div v-if="recentViewings.length === 0" class="text-center py-4 text-gray-500">
            暂无看房记录
          </div>
          
          <div class="pt-2">
            <router-link
              to="/my-viewings"
              class="text-sm text-primary-600 hover:text-primary-500 font-medium"
            >
              查看全部看房记录 →
            </router-link>
          </div>
        </div>
      </div>
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
  HomeIcon,
  BuildingOfficeIcon,
  ChartBarIcon,
  EyeIcon,
  StarIcon
} from '@heroicons/vue/24/outline'
import { dashboardAPI } from '@/services/api'

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

const overview = ref(null)
const trendData = ref(null)
const recentProperties = ref([])
const recentViewings = ref([])
const selectedPeriod = ref(30)

const periods = [
  { label: '7天', value: 7 },
  { label: '30天', value: 30 },
  { label: '90天', value: 90 }
]

// 图表数据
const chartData = computed(() => {
  if (!trendData.value?.trend_data) return null
  
  const data = trendData.value.trend_data
  return {
    labels: data.map(item => new Date(item.date).toLocaleDateString()),
    datasets: [
      {
        label: '新房成交套数',
        data: data.map(item => item.new_deal_units),
        borderColor: 'rgb(59, 130, 246)',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        tension: 0.4
      },
      {
        label: '二手房成交套数',
        data: data.map(item => item.secondhand_deal_units),
        borderColor: 'rgb(16, 185, 129)',
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
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
      beginAtZero: true
    }
  }
}

// 格式化日期
const formatDate = (dateString) => {
  return new Date(dateString).toLocaleDateString()
}

// 加载概览数据
const loadOverview = async () => {
  try {
    const response = await dashboardAPI.getOverview()
    overview.value = response.data
  } catch (error) {
    console.error('Failed to load overview:', error)
  }
}

// 加载趋势数据
const loadTrendData = async () => {
  try {
    const response = await dashboardAPI.getTrend(selectedPeriod.value)
    trendData.value = response.data
  } catch (error) {
    console.error('Failed to load trend data:', error)
  }
}

// 加载最近数据
const loadRecentData = async () => {
  // 这里应该调用获取最近房源和看房记录的API
  // 暂时使用模拟数据
  recentProperties.value = []
  recentViewings.value = []
}

onMounted(() => {
  loadOverview()
  loadTrendData()
  loadRecentData()
})
</script>
