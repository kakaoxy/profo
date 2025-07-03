<template>
  <div class="space-y-6">
    <!-- 页面标题 -->
    <div>
      <h1 class="text-2xl font-bold text-gray-900">
        {{ isEdit ? '编辑看房笔记' : '新增看房笔记' }}
      </h1>
      <p class="mt-2 text-sm text-gray-600">
        {{ isEdit ? '修改您的看房体验和评价' : '记录您的看房体验和评价' }}
      </p>
    </div>

    <!-- 表单 -->
    <form @submit.prevent="handleSubmit" class="space-y-6">
      <!-- 基本信息 -->
      <div class="card">
        <h3 class="text-lg font-medium text-gray-900 mb-6">基本信息</h3>
        
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label class="label">关联房源 *</label>
            <select v-model="form.property_id" required class="input-field">
              <option value="">请选择房源</option>
              <option
                v-for="property in properties"
                :key="property.id"
                :value="property.id"
              >
                {{ property.community_name }} - {{ property.layout_bedrooms }}室{{ property.layout_living_rooms }}厅
              </option>
            </select>
          </div>
          
          <div>
            <label class="label">带看经纪人</label>
            <select v-model="form.agent_id" class="input-field">
              <option value="">请选择经纪人</option>
              <option
                v-for="agent in agents"
                :key="agent.id"
                :value="agent.id"
              >
                {{ agent.name }} - {{ agent.agency_name }}
              </option>
            </select>
          </div>
          
          <div>
            <label class="label">看房时间 *</label>
            <input
              v-model="form.viewing_date"
              type="date"
              required
              class="input-field"
            />
          </div>
          
          <div>
            <label class="label">预期购买价格（万元）</label>
            <input
              v-model="form.expected_purchase_price_wan"
              type="number"
              step="0.01"
              class="input-field"
              placeholder="如：240.00"
            />
          </div>
        </div>
      </div>

      <!-- 评价信息 -->
      <div class="card">
        <h3 class="text-lg font-medium text-gray-900 mb-6">评价信息</h3>
        
        <div class="space-y-6">
          <!-- 评分 -->
          <div>
            <label class="label">总体评分</label>
            <div class="flex items-center space-x-2">
              <div class="flex items-center">
                <button
                  v-for="i in 5"
                  :key="i"
                  type="button"
                  @click="form.rating = i"
                  class="p-1"
                >
                  <StarIcon
                    class="h-6 w-6 transition-colors"
                    :class="i <= (form.rating || 0) ? 'text-yellow-400' : 'text-gray-300 hover:text-yellow-200'"
                  />
                </button>
              </div>
              <span class="text-sm text-gray-600">
                {{ form.rating || 0 }}/5
              </span>
            </div>
          </div>
          
          <!-- 总体印象 -->
          <div>
            <label class="label">总体印象</label>
            <textarea
              v-model="form.notes_general"
              rows="4"
              class="input-field"
              placeholder="请描述您对这套房源的总体印象..."
            ></textarea>
          </div>
          
          <!-- 优点 -->
          <div>
            <label class="label">优点</label>
            <textarea
              v-model="form.notes_pros"
              rows="3"
              class="input-field"
              placeholder="请列出这套房源的优点..."
            ></textarea>
          </div>
          
          <!-- 缺点 -->
          <div>
            <label class="label">缺点</label>
            <textarea
              v-model="form.notes_cons"
              rows="3"
              class="input-field"
              placeholder="请列出这套房源的缺点..."
            ></textarea>
          </div>
        </div>
      </div>

      <!-- 操作按钮 -->
      <div class="flex justify-end space-x-4">
        <button
          type="button"
          @click="$router.go(-1)"
          class="btn-secondary"
        >
          取消
        </button>
        <button
          type="submit"
          :disabled="loading"
          class="btn-primary disabled:opacity-50"
        >
          <span v-if="loading" class="flex items-center">
            <svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            {{ isEdit ? '更新中...' : '创建中...' }}
          </span>
          <span v-else>
            {{ isEdit ? '更新笔记' : '创建笔记' }}
          </span>
        </button>
      </div>
    </form>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { StarIcon } from '@heroicons/vue/24/outline'
import { viewingAPI, propertyAPI, agentAPI } from '@/services/api'

const router = useRouter()
const route = useRoute()
const loading = ref(false)
const properties = ref([])
const agents = ref([])

const props = defineProps({
  id: String
})

const isEdit = computed(() => !!props.id)

const form = reactive({
  property_id: '',
  agent_id: '',
  viewing_date: '',
  expected_purchase_price_wan: '',
  rating: 0,
  notes_general: '',
  notes_pros: '',
  notes_cons: ''
})

// 加载房源列表
const loadProperties = async () => {
  try {
    const response = await propertyAPI.getProperties({ limit: 100 })
    properties.value = response.data
  } catch (error) {
    console.error('Failed to load properties:', error)
  }
}

// 加载经纪人列表
const loadAgents = async () => {
  try {
    const response = await agentAPI.getAgents({ limit: 100 })
    agents.value = response.data
  } catch (error) {
    console.error('Failed to load agents:', error)
  }
}

// 加载看房笔记详情（编辑模式）
const loadViewing = async () => {
  if (!props.id) return
  
  try {
    const response = await viewingAPI.getViewing(props.id)
    const viewing = response.data
    
    // 填充表单
    Object.keys(form).forEach(key => {
      if (viewing[key] !== undefined && viewing[key] !== null) {
        form[key] = viewing[key]
      }
    })
    
    // 处理日期格式
    if (viewing.viewing_date) {
      form.viewing_date = new Date(viewing.viewing_date).toISOString().split('T')[0]
    }
  } catch (error) {
    console.error('Failed to load viewing:', error)
    alert('加载看房笔记失败')
    router.push('/my-viewings')
  }
}

// 提交表单
const handleSubmit = async () => {
  try {
    loading.value = true
    
    // 清理空值
    const data = Object.fromEntries(
      Object.entries(form).filter(([_, value]) => value !== '' && value !== null)
    )
    
    // 确保agent_id为null而不是空字符串
    if (!data.agent_id) {
      data.agent_id = null
    }
    
    if (isEdit.value) {
      await viewingAPI.updateViewing(props.id, data)
      alert('看房笔记更新成功')
    } else {
      await viewingAPI.createViewing(data)
      alert('看房笔记创建成功')
    }
    
    router.push('/my-viewings')
  } catch (error) {
    console.error('Failed to save viewing:', error)
    alert(error.response?.data?.detail || '保存失败，请重试')
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  loadProperties()
  loadAgents()
  if (isEdit.value) {
    loadViewing()
  } else {
    // 设置默认看房时间为今天
    form.viewing_date = new Date().toISOString().split('T')[0]
  }
})
</script>
