<template>
  <div class="space-y-8">
    <!-- 页面标题 -->
    <div>
      <h1 class="text-2xl font-bold text-gray-900">基础数据管理</h1>
      <p class="mt-2 text-sm text-gray-600">管理系统中的基础实体数据</p>
    </div>

    <!-- 标签页导航 -->
    <div class="border-b border-gray-200">
      <nav class="-mb-px flex space-x-8">
        <button
          v-for="tab in tabs"
          :key="tab.key"
          @click="activeTab = tab.key"
          class="py-2 px-1 border-b-2 font-medium text-sm transition-colors"
          :class="activeTab === tab.key
            ? 'border-primary-500 text-primary-600'
            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'"
        >
          <component :is="tab.icon" class="h-5 w-5 mr-2 inline" />
          {{ tab.label }}
        </button>
      </nav>
    </div>

    <!-- 城市管理 -->
    <div v-if="activeTab === 'cities'" class="space-y-6">
      <div class="flex items-center justify-between">
        <h2 class="text-lg font-medium text-gray-900">城市管理</h2>
        <button @click="openCityForm()" class="btn-primary">
          <PlusIcon class="h-4 w-4 mr-2" />
          新增城市
        </button>
      </div>
      
      <div class="card">
        <div class="overflow-hidden">
          <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">城市名称</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">省份</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">创建时间</th>
                <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">操作</th>
              </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
              <tr v-for="city in cities" :key="city.id" class="hover:bg-gray-50">
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                  {{ city.name }}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {{ city.province || '-' }}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {{ formatDate(city.created_at) }}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                  <button
                    @click="openCityForm(city)"
                    class="text-indigo-600 hover:text-indigo-900"
                  >
                    编辑
                  </button>
                  <button
                    @click="deleteCity(city)"
                    class="text-red-600 hover:text-red-900"
                  >
                    删除
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- 中介公司管理 -->
    <div v-if="activeTab === 'agencies'" class="space-y-6">
      <div class="flex items-center justify-between">
        <h2 class="text-lg font-medium text-gray-900">中介公司管理</h2>
        <button @click="openAgencyForm()" class="btn-primary">
          <PlusIcon class="h-4 w-4 mr-2" />
          新增中介公司
        </button>
      </div>
      
      <div class="card">
        <div class="overflow-hidden">
          <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">公司名称</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">联系电话</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">地址</th>
                <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">操作</th>
              </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
              <tr v-for="agency in agencies" :key="agency.id" class="hover:bg-gray-50">
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                  {{ agency.name }}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {{ agency.phone || '-' }}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {{ agency.address || '-' }}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                  <button
                    @click="openAgencyForm(agency)"
                    class="text-indigo-600 hover:text-indigo-900"
                  >
                    编辑
                  </button>
                  <button
                    @click="deleteAgency(agency)"
                    class="text-red-600 hover:text-red-900"
                  >
                    删除
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- 经纪人管理 -->
    <div v-if="activeTab === 'agents'" class="space-y-6">
      <div class="flex items-center justify-between">
        <h2 class="text-lg font-medium text-gray-900">经纪人管理</h2>
        <button @click="openAgentForm()" class="btn-primary">
          <PlusIcon class="h-4 w-4 mr-2" />
          新增经纪人
        </button>
      </div>
      
      <div class="card">
        <div class="overflow-hidden">
          <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">姓名</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">所属公司</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">联系电话</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">微信号</th>
                <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">操作</th>
              </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
              <tr v-for="agent in agents" :key="agent.id" class="hover:bg-gray-50">
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                  {{ agent.name }}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {{ agent.agency_name || '-' }}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {{ agent.phone || '-' }}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {{ agent.wechat || '-' }}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                  <button
                    @click="openAgentForm(agent)"
                    class="text-indigo-600 hover:text-indigo-900"
                  >
                    编辑
                  </button>
                  <button
                    @click="deleteAgent(agent)"
                    class="text-red-600 hover:text-red-900"
                  >
                    删除
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- 小区管理 -->
    <div v-if="activeTab === 'communities'" class="space-y-6">
      <div class="flex items-center justify-between">
        <h2 class="text-lg font-medium text-gray-900">小区管理</h2>
        <button @click="openCommunityForm()" class="btn-primary">
          <PlusIcon class="h-4 w-4 mr-2" />
          新增小区
        </button>
      </div>
      
      <div class="card">
        <div class="overflow-hidden">
          <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">小区名称</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">所属城市</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">区域</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">建成年份</th>
                <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">操作</th>
              </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
              <tr v-for="community in communities" :key="community.id" class="hover:bg-gray-50">
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                  {{ community.name }}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {{ community.city_name || '-' }}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {{ community.district || '-' }}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {{ community.build_year || '-' }}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                  <button
                    @click="openCommunityForm(community)"
                    class="text-indigo-600 hover:text-indigo-900"
                  >
                    编辑
                  </button>
                  <button
                    @click="deleteCommunity(community)"
                    class="text-red-600 hover:text-red-900"
                  >
                    删除
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>

  <!-- 这里应该添加各种表单的模态框组件 -->
  <!-- 由于篇幅限制，暂时省略具体的表单实现 -->
</template>

<script setup>
import { ref, onMounted } from 'vue'
import {
  MapPinIcon,
  BuildingOfficeIcon,
  UserGroupIcon,
  BuildingOffice2Icon,
  PlusIcon
} from '@heroicons/vue/24/outline'
import { cityAPI, agencyAPI, agentAPI, communityAPI } from '@/services/api'

const activeTab = ref('cities')
const cities = ref([])
const agencies = ref([])
const agents = ref([])
const communities = ref([])

const tabs = [
  { key: 'cities', label: '城市管理', icon: MapPinIcon },
  { key: 'agencies', label: '中介公司', icon: BuildingOfficeIcon },
  { key: 'agents', label: '经纪人', icon: UserGroupIcon },
  { key: 'communities', label: '小区管理', icon: BuildingOffice2Icon }
]

// 格式化日期
const formatDate = (dateString) => {
  return new Date(dateString).toLocaleDateString()
}

// 加载数据
const loadCities = async () => {
  try {
    const response = await cityAPI.getCities()
    cities.value = response.data
  } catch (error) {
    console.error('Failed to load cities:', error)
  }
}

const loadAgencies = async () => {
  try {
    const response = await agencyAPI.getAgencies()
    agencies.value = response.data
  } catch (error) {
    console.error('Failed to load agencies:', error)
  }
}

const loadAgents = async () => {
  try {
    const response = await agentAPI.getAgents()
    agents.value = response.data
  } catch (error) {
    console.error('Failed to load agents:', error)
  }
}

const loadCommunities = async () => {
  try {
    const response = await communityAPI.getCommunities()
    communities.value = response.data
  } catch (error) {
    console.error('Failed to load communities:', error)
  }
}

// 表单操作（这里只是占位函数，实际需要实现模态框表单）
const openCityForm = (city = null) => {
  console.log('Open city form:', city)
  // 实现城市表单模态框
}

const openAgencyForm = (agency = null) => {
  console.log('Open agency form:', agency)
  // 实现中介公司表单模态框
}

const openAgentForm = (agent = null) => {
  console.log('Open agent form:', agent)
  // 实现经纪人表单模态框
}

const openCommunityForm = (community = null) => {
  console.log('Open community form:', community)
  // 实现小区表单模态框
}

// 删除操作
const deleteCity = async (city) => {
  if (!confirm(`确定要删除城市"${city.name}"吗？`)) return
  
  try {
    await cityAPI.deleteCity(city.id)
    loadCities()
  } catch (error) {
    console.error('Failed to delete city:', error)
    alert('删除失败，请重试')
  }
}

const deleteAgency = async (agency) => {
  if (!confirm(`确定要删除中介公司"${agency.name}"吗？`)) return
  
  try {
    await agencyAPI.deleteAgency(agency.id)
    loadAgencies()
  } catch (error) {
    console.error('Failed to delete agency:', error)
    alert('删除失败，请重试')
  }
}

const deleteAgent = async (agent) => {
  if (!confirm(`确定要删除经纪人"${agent.name}"吗？`)) return
  
  try {
    await agentAPI.deleteAgent(agent.id)
    loadAgents()
  } catch (error) {
    console.error('Failed to delete agent:', error)
    alert('删除失败，请重试')
  }
}

const deleteCommunity = async (community) => {
  if (!confirm(`确定要删除小区"${community.name}"吗？`)) return
  
  try {
    await communityAPI.deleteCommunity(community.id)
    loadCommunities()
  } catch (error) {
    console.error('Failed to delete community:', error)
    alert('删除失败，请重试')
  }
}

onMounted(() => {
  loadCities()
  loadAgencies()
  loadAgents()
  loadCommunities()
})
</script>
