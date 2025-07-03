<template>
  <div class="space-y-6">
    <!-- 页面标题 -->
    <div>
      <h1 class="text-2xl font-bold text-gray-900">
        {{ isEdit ? '编辑房源' : '新增房源' }}
      </h1>
      <p class="mt-2 text-sm text-gray-600">
        {{ isEdit ? '修改房源信息' : '添加新的房源信息' }}
      </p>
    </div>

    <!-- 表单 -->
    <form @submit.prevent="handleSubmit" class="space-y-6">
      <div class="card">
        <h3 class="text-lg font-medium text-gray-900 mb-6">基本信息</h3>
        
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label class="label">小区 *</label>
            <select v-model="form.community_id" required class="input-field">
              <option value="">请选择小区</option>
              <option
                v-for="community in communities"
                :key="community.id"
                :value="community.id"
              >
                {{ community.name }}
              </option>
            </select>
          </div>
          
          <div>
            <label class="label">房源状态 *</label>
            <select v-model="form.status" required class="input-field">
              <option value="">请选择状态</option>
              <option value="在售">在售</option>
              <option value="已成交">已成交</option>
              <option value="个人记录">个人记录</option>
              <option value="已下架">已下架</option>
            </select>
          </div>
          
          <div>
            <label class="label">来源房源ID</label>
            <input
              v-model="form.source_property_id"
              type="text"
              class="input-field"
              placeholder="如：107111735298"
            />
          </div>
          
          <div>
            <label class="label">建筑面积（㎡）</label>
            <input
              v-model="form.area_sqm"
              type="number"
              step="0.01"
              class="input-field"
              placeholder="如：55.00"
            />
          </div>
        </div>
      </div>

      <div class="card">
        <h3 class="text-lg font-medium text-gray-900 mb-6">户型信息</h3>
        
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <label class="label">卧室数量</label>
            <input
              v-model="form.layout_bedrooms"
              type="number"
              min="0"
              class="input-field"
              placeholder="如：2"
            />
          </div>
          
          <div>
            <label class="label">客厅数量</label>
            <input
              v-model="form.layout_living_rooms"
              type="number"
              min="0"
              class="input-field"
              placeholder="如：1"
            />
          </div>
          
          <div>
            <label class="label">卫生间数量</label>
            <input
              v-model="form.layout_bathrooms"
              type="number"
              min="0"
              class="input-field"
              placeholder="如：1"
            />
          </div>
          
          <div>
            <label class="label">房屋朝向</label>
            <input
              v-model="form.orientation"
              type="text"
              class="input-field"
              placeholder="如：双南"
            />
          </div>
          
          <div>
            <label class="label">楼层描述</label>
            <input
              v-model="form.floor_level"
              type="text"
              class="input-field"
              placeholder="如：中楼层"
            />
          </div>
          
          <div>
            <label class="label">总楼层数</label>
            <input
              v-model="form.total_floors"
              type="number"
              min="1"
              class="input-field"
              placeholder="如：6"
            />
          </div>
        </div>
        
        <div class="mt-6">
          <label class="label">建筑年代</label>
          <input
            v-model="form.build_year"
            type="number"
            min="1900"
            :max="new Date().getFullYear()"
            class="input-field"
            placeholder="如：1993"
          />
        </div>
      </div>

      <div class="card">
        <h3 class="text-lg font-medium text-gray-900 mb-6">价格信息</h3>
        
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label class="label">挂牌价格（万元）</label>
            <input
              v-model="form.listing_price_wan"
              type="number"
              step="0.01"
              class="input-field"
              placeholder="如：240.00"
            />
          </div>
          
          <div>
            <label class="label">挂牌日期</label>
            <input
              v-model="form.listing_date"
              type="date"
              class="input-field"
            />
          </div>
          
          <div>
            <label class="label">成交价格（万元）</label>
            <input
              v-model="form.deal_price_wan"
              type="number"
              step="0.01"
              class="input-field"
              placeholder="如：246.00"
            />
          </div>
          
          <div>
            <label class="label">成交日期</label>
            <input
              v-model="form.deal_date"
              type="date"
              class="input-field"
            />
          </div>
          
          <div>
            <label class="label">成交周期（天）</label>
            <input
              v-model="form.deal_cycle_days"
              type="number"
              min="0"
              class="input-field"
              placeholder="如：59"
            />
          </div>
        </div>
      </div>

      <div class="card">
        <h3 class="text-lg font-medium text-gray-900 mb-6">其他信息</h3>
        
        <div class="space-y-6">
          <div>
            <label class="label">原始链接</label>
            <input
              v-model="form.source_url"
              type="url"
              class="input-field"
              placeholder="https://..."
            />
          </div>
          
          <div>
            <label class="label">图片链接</label>
            <input
              v-model="form.image_url"
              type="url"
              class="input-field"
              placeholder="https://..."
            />
          </div>
          
          <div>
            <label class="label">抵押信息</label>
            <textarea
              v-model="form.mortgage_info"
              rows="3"
              class="input-field"
              placeholder="如：有抵押..."
            ></textarea>
          </div>
          
          <div>
            <label class="label">标签</label>
            <input
              v-model="form.tags"
              type="text"
              class="input-field"
              placeholder="多个标签用逗号分隔，如：房屋满五年,精装"
            />
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
            {{ isEdit ? '更新房源' : '创建房源' }}
          </span>
        </button>
      </div>
    </form>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { propertyAPI, communityAPI } from '@/services/api'

const router = useRouter()
const route = useRoute()
const loading = ref(false)
const communities = ref([])

const props = defineProps({
  id: String
})

const isEdit = computed(() => !!props.id)

const form = reactive({
  community_id: '',
  status: '',
  source_property_id: '',
  layout_bedrooms: '',
  layout_living_rooms: '',
  layout_bathrooms: '',
  area_sqm: '',
  orientation: '',
  floor_level: '',
  total_floors: '',
  build_year: '',
  listing_price_wan: '',
  listing_date: '',
  deal_price_wan: '',
  deal_date: '',
  deal_cycle_days: '',
  source_url: '',
  image_url: '',
  mortgage_info: '',
  tags: ''
})

// 加载小区列表
const loadCommunities = async () => {
  try {
    const response = await communityAPI.getCommunities()
    communities.value = response.data
  } catch (error) {
    console.error('Failed to load communities:', error)
  }
}

// 加载房源详情（编辑模式）
const loadProperty = async () => {
  if (!props.id) return
  
  try {
    const response = await propertyAPI.getProperty(props.id)
    const property = response.data
    
    // 填充表单
    Object.keys(form).forEach(key => {
      if (property[key] !== undefined && property[key] !== null) {
        form[key] = property[key]
      }
    })
  } catch (error) {
    console.error('Failed to load property:', error)
    alert('加载房源信息失败')
    router.push('/properties')
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
    
    if (isEdit.value) {
      await propertyAPI.updateProperty(props.id, data)
      alert('房源更新成功')
    } else {
      await propertyAPI.createProperty(data)
      alert('房源创建成功')
    }
    
    router.push('/properties')
  } catch (error) {
    console.error('Failed to save property:', error)
    alert(error.response?.data?.detail || '保存失败，请重试')
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  loadCommunities()
  if (isEdit.value) {
    loadProperty()
  }
})
</script>
