<template>
  <div class="space-y-6">
    <!-- 页面标题和操作 -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold text-gray-900">个人看房管理</h1>
        <p class="mt-2 text-sm text-gray-600">管理您的看房笔记和评价</p>
      </div>
      <router-link
        to="/my-viewings/new"
        class="btn-primary"
      >
        <PlusIcon class="h-5 w-5 mr-2" />
        新增看房笔记
      </router-link>
    </div>

    <!-- 看房笔记列表 -->
    <div v-if="viewings.length > 0" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      <div
        v-for="viewing in viewings"
        :key="viewing.id"
        class="card hover:shadow-md transition-shadow duration-200"
      >
        <!-- 卡片头部 -->
        <div class="flex items-start justify-between mb-4">
          <div class="flex-1">
            <h3 class="text-lg font-medium text-gray-900 mb-1">
              {{ viewing.property_name || '未知房源' }}
            </h3>
            <p class="text-sm text-gray-500">
              {{ viewing.property_layout || '' }} · {{ viewing.property_area || '' }}㎡
            </p>
          </div>
          <div class="flex space-x-1">
            <button
              @click="editViewing(viewing)"
              class="p-1 text-gray-400 hover:text-gray-600"
            >
              <PencilIcon class="h-4 w-4" />
            </button>
            <button
              @click="deleteViewing(viewing)"
              class="p-1 text-gray-400 hover:text-red-600"
            >
              <TrashIcon class="h-4 w-4" />
            </button>
          </div>
        </div>

        <!-- 评分 -->
        <div class="flex items-center mb-3">
          <div class="flex items-center">
            <StarIcon
              v-for="i in 5"
              :key="i"
              class="h-5 w-5"
              :class="i <= (viewing.rating || 0) ? 'text-yellow-400' : 'text-gray-300'"
            />
          </div>
          <span class="ml-2 text-sm text-gray-600">{{ viewing.rating || 0 }}/5</span>
        </div>

        <!-- 看房信息 -->
        <div class="space-y-2 mb-4">
          <div class="flex items-center text-sm text-gray-600">
            <CalendarIcon class="h-4 w-4 mr-2" />
            看房时间：{{ formatDate(viewing.viewing_date) }}
          </div>
          
          <div v-if="viewing.expected_purchase_price_wan" class="flex items-center text-sm text-gray-600">
            <CurrencyDollarIcon class="h-4 w-4 mr-2" />
            预期价格：{{ viewing.expected_purchase_price_wan }}万
          </div>
          
          <div v-if="viewing.agent_name" class="flex items-center text-sm text-gray-600">
            <UserIcon class="h-4 w-4 mr-2" />
            带看经纪人：{{ viewing.agent_name }}
          </div>
        </div>

        <!-- 笔记内容 -->
        <div class="space-y-3">
          <div v-if="viewing.notes_general" class="text-sm">
            <div class="font-medium text-gray-700 mb-1">总体印象</div>
            <p class="text-gray-600 line-clamp-2">{{ viewing.notes_general }}</p>
          </div>
          
          <div v-if="viewing.notes_pros" class="text-sm">
            <div class="font-medium text-green-700 mb-1">优点</div>
            <p class="text-gray-600 line-clamp-2">{{ viewing.notes_pros }}</p>
          </div>
          
          <div v-if="viewing.notes_cons" class="text-sm">
            <div class="font-medium text-red-700 mb-1">缺点</div>
            <p class="text-gray-600 line-clamp-2">{{ viewing.notes_cons }}</p>
          </div>
        </div>

        <!-- 卡片底部 -->
        <div class="mt-4 pt-4 border-t border-gray-200 flex items-center justify-between">
          <span class="text-xs text-gray-500">
            {{ formatDate(viewing.created_at) }}
          </span>
          <router-link
            :to="`/properties/${viewing.property_id}`"
            class="text-xs text-primary-600 hover:text-primary-500"
          >
            查看房源详情 →
          </router-link>
        </div>
      </div>
    </div>

    <!-- 空状态 -->
    <div v-else-if="!loading" class="text-center py-12">
      <EyeIcon class="mx-auto h-12 w-12 text-gray-400" />
      <h3 class="mt-2 text-sm font-medium text-gray-900">暂无看房记录</h3>
      <p class="mt-1 text-sm text-gray-500">开始记录您的第一次看房体验吧</p>
      <div class="mt-6">
        <router-link to="/my-viewings/new" class="btn-primary">
          <PlusIcon class="h-5 w-5 mr-2" />
          新增看房笔记
        </router-link>
      </div>
    </div>

    <!-- 加载状态 -->
    <div v-if="loading" class="text-center py-12">
      <div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      <p class="mt-2 text-sm text-gray-500">加载中...</p>
    </div>

    <!-- 分页 -->
    <div v-if="viewings.length > 0" class="flex justify-center">
      <nav class="flex items-center space-x-2">
        <button
          @click="prevPage"
          :disabled="currentPage === 1"
          class="px-3 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
        >
          上一页
        </button>
        <span class="px-3 py-2 text-sm text-gray-700">
          第 {{ currentPage }} 页
        </span>
        <button
          @click="nextPage"
          :disabled="!hasNextPage"
          class="px-3 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
        >
          下一页
        </button>
      </nav>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import {
  PlusIcon,
  PencilIcon,
  TrashIcon,
  StarIcon,
  CalendarIcon,
  CurrencyDollarIcon,
  UserIcon,
  EyeIcon
} from '@heroicons/vue/24/outline'
import { viewingAPI } from '@/services/api'

const router = useRouter()
const viewings = ref([])
const loading = ref(false)
const currentPage = ref(1)
const pageSize = ref(12)

const hasNextPage = computed(() => {
  return viewings.value.length === pageSize.value
})

// 格式化日期
const formatDate = (dateString) => {
  return new Date(dateString).toLocaleDateString()
}

// 加载看房笔记列表
const loadViewings = async () => {
  try {
    loading.value = true
    const response = await viewingAPI.getViewings({
      page: currentPage.value,
      limit: pageSize.value
    })
    viewings.value = response.data
  } catch (error) {
    console.error('Failed to load viewings:', error)
  } finally {
    loading.value = false
  }
}

// 编辑看房笔记
const editViewing = (viewing) => {
  router.push(`/my-viewings/${viewing.id}/edit`)
}

// 删除看房笔记
const deleteViewing = async (viewing) => {
  if (!confirm(`确定要删除这条看房笔记吗？`)) {
    return
  }
  
  try {
    await viewingAPI.deleteViewing(viewing.id)
    loadViewings()
  } catch (error) {
    console.error('Failed to delete viewing:', error)
    alert('删除失败，请重试')
  }
}

// 分页
const prevPage = () => {
  if (currentPage.value > 1) {
    currentPage.value--
    loadViewings()
  }
}

const nextPage = () => {
  if (hasNextPage.value) {
    currentPage.value++
    loadViewings()
  }
}

onMounted(() => {
  loadViewings()
})
</script>

<style scoped>
.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
