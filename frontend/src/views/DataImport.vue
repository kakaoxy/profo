<template>
  <div class="space-y-8">
    <!-- 页面标题 -->
    <div>
      <h1 class="text-2xl font-bold text-gray-900">数据导入</h1>
      <p class="mt-2 text-sm text-gray-600">支持多种数据源的导入，快速批量添加房源信息</p>
    </div>

    <!-- CSV文件导入 -->
    <div class="card">
      <div class="flex items-center mb-6">
        <DocumentArrowUpIcon class="h-6 w-6 text-primary-600 mr-3" />
        <h3 class="text-lg font-medium text-gray-900">CSV文件导入</h3>
      </div>
      
      <div class="space-y-6">
        <!-- 模板下载 -->
        <div class="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div class="flex items-start">
            <InformationCircleIcon class="h-5 w-5 text-blue-400 mt-0.5 mr-3" />
            <div class="flex-1">
              <h4 class="text-sm font-medium text-blue-800">导入说明</h4>
              <div class="mt-2 text-sm text-blue-700">
                <p>请先下载CSV模板，按照模板格式填写数据后再上传。</p>
                <ul class="mt-2 list-disc list-inside space-y-1">
                  <li>必填字段：小区ID、房源状态</li>
                  <li>支持的状态：在售、已成交、个人记录、已下架</li>
                  <li>价格单位：万元</li>
                  <li>面积单位：平方米</li>
                </ul>
              </div>
              <div class="mt-4">
                <button
                  @click="downloadTemplate"
                  class="btn-secondary text-sm"
                >
                  <DocumentArrowDownIcon class="h-4 w-4 mr-2" />
                  下载CSV模板
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- 文件上传区域 -->
        <div class="border-2 border-dashed border-gray-300 rounded-lg p-6">
          <div class="text-center">
            <DocumentArrowUpIcon class="mx-auto h-12 w-12 text-gray-400" />
            <div class="mt-4">
              <label for="file-upload" class="cursor-pointer">
                <span class="mt-2 block text-sm font-medium text-gray-900">
                  点击选择文件或拖拽文件到此处
                </span>
                <input
                  id="file-upload"
                  ref="fileInput"
                  type="file"
                  accept=".csv"
                  class="sr-only"
                  @change="handleFileSelect"
                />
              </label>
              <p class="mt-2 text-xs text-gray-500">
                支持CSV格式，文件大小不超过10MB
              </p>
            </div>
          </div>
        </div>

        <!-- 选中的文件信息 -->
        <div v-if="selectedFile" class="bg-gray-50 rounded-lg p-4">
          <div class="flex items-center justify-between">
            <div class="flex items-center">
              <DocumentIcon class="h-5 w-5 text-gray-400 mr-3" />
              <div>
                <p class="text-sm font-medium text-gray-900">{{ selectedFile.name }}</p>
                <p class="text-xs text-gray-500">{{ formatFileSize(selectedFile.size) }}</p>
              </div>
            </div>
            <button
              @click="clearFile"
              class="text-gray-400 hover:text-gray-600"
            >
              <XMarkIcon class="h-5 w-5" />
            </button>
          </div>
        </div>

        <!-- 上传按钮 -->
        <div class="flex justify-end">
          <button
            @click="uploadFile"
            :disabled="!selectedFile || uploading"
            class="btn-primary disabled:opacity-50"
          >
            <span v-if="uploading" class="flex items-center">
              <svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              上传中...
            </span>
            <span v-else>
              <DocumentArrowUpIcon class="h-4 w-4 mr-2" />
              开始导入
            </span>
          </button>
        </div>
      </div>
    </div>

    <!-- API同步 -->
    <div class="card">
      <div class="flex items-center mb-6">
        <ArrowPathIcon class="h-6 w-6 text-green-600 mr-3" />
        <h3 class="text-lg font-medium text-gray-900">API数据同步</h3>
      </div>
      
      <div class="space-y-4">
        <div class="bg-green-50 border border-green-200 rounded-lg p-4">
          <div class="flex items-start">
            <InformationCircleIcon class="h-5 w-5 text-green-400 mt-0.5 mr-3" />
            <div class="flex-1">
              <h4 class="text-sm font-medium text-green-800">同步说明</h4>
              <p class="mt-2 text-sm text-green-700">
                从外部API同步最新的房源数据和成交统计信息。同步过程可能需要几分钟时间。
              </p>
            </div>
          </div>
        </div>
        
        <div class="flex justify-end">
          <button
            @click="syncExternalData"
            :disabled="syncing"
            class="btn-primary disabled:opacity-50"
          >
            <span v-if="syncing" class="flex items-center">
              <svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              同步中...
            </span>
            <span v-else>
              <ArrowPathIcon class="h-4 w-4 mr-2" />
              同步外部数据
            </span>
          </button>
        </div>
      </div>
    </div>

    <!-- 手动录入 -->
    <div class="card">
      <div class="flex items-center mb-6">
        <PencilSquareIcon class="h-6 w-6 text-purple-600 mr-3" />
        <h3 class="text-lg font-medium text-gray-900">手动录入</h3>
      </div>
      
      <div class="space-y-4">
        <p class="text-sm text-gray-600">
          如果您只需要添加少量房源，可以使用手动录入功能。
        </p>
        
        <div class="flex space-x-4">
          <router-link
            to="/properties/new"
            class="btn-primary"
          >
            <PlusIcon class="h-4 w-4 mr-2" />
            新增房源
          </router-link>
          
          <router-link
            to="/my-viewings/new"
            class="btn-secondary"
          >
            <EyeIcon class="h-4 w-4 mr-2" />
            新增看房笔记
          </router-link>
        </div>
      </div>
    </div>

    <!-- 导入结果 -->
    <div v-if="importResult" class="card">
      <div class="flex items-center mb-4">
        <CheckCircleIcon v-if="importResult.success" class="h-6 w-6 text-green-600 mr-3" />
        <ExclamationTriangleIcon v-else class="h-6 w-6 text-red-600 mr-3" />
        <h3 class="text-lg font-medium text-gray-900">导入结果</h3>
      </div>
      
      <div class="space-y-4">
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div class="text-center p-4 bg-green-50 rounded-lg">
            <div class="text-2xl font-bold text-green-600">{{ importResult.success_count || 0 }}</div>
            <div class="text-sm text-green-700">成功导入</div>
          </div>
          <div class="text-center p-4 bg-red-50 rounded-lg">
            <div class="text-2xl font-bold text-red-600">{{ importResult.error_count || 0 }}</div>
            <div class="text-sm text-red-700">导入失败</div>
          </div>
          <div class="text-center p-4 bg-blue-50 rounded-lg">
            <div class="text-2xl font-bold text-blue-600">{{ importResult.total_count || 0 }}</div>
            <div class="text-sm text-blue-700">总计处理</div>
          </div>
        </div>
        
        <div v-if="importResult.errors && importResult.errors.length > 0" class="mt-4">
          <h4 class="text-sm font-medium text-red-800 mb-2">错误详情：</h4>
          <div class="bg-red-50 border border-red-200 rounded-lg p-3">
            <ul class="text-sm text-red-700 space-y-1">
              <li v-for="(error, index) in importResult.errors" :key="index">
                第{{ error.row }}行：{{ error.message }}
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import {
  DocumentArrowUpIcon,
  DocumentArrowDownIcon,
  DocumentIcon,
  ArrowPathIcon,
  PencilSquareIcon,
  PlusIcon,
  EyeIcon,
  XMarkIcon,
  InformationCircleIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon
} from '@heroicons/vue/24/outline'
import { importAPI } from '@/services/api'

const selectedFile = ref(null)
const uploading = ref(false)
const syncing = ref(false)
const importResult = ref(null)
const fileInput = ref(null)

// 文件选择处理
const handleFileSelect = (event) => {
  const file = event.target.files[0]
  if (file) {
    if (file.type !== 'text/csv' && !file.name.endsWith('.csv')) {
      alert('请选择CSV格式的文件')
      return
    }
    if (file.size > 10 * 1024 * 1024) { // 10MB
      alert('文件大小不能超过10MB')
      return
    }
    selectedFile.value = file
  }
}

// 清除选中的文件
const clearFile = () => {
  selectedFile.value = null
  if (fileInput.value) {
    fileInput.value.value = ''
  }
}

// 格式化文件大小
const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

// 下载模板
const downloadTemplate = async () => {
  try {
    const response = await importAPI.getTemplate()
    const template = response.data
    
    // 创建CSV内容
    const headers = template.template_fields.join(',')
    const sampleRow = template.template_fields.map(field => 
      template.sample_data[field][0] || ''
    ).join(',')
    
    const csvContent = `${headers}\n${sampleRow}`
    
    // 下载文件
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', 'properties_template.csv')
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  } catch (error) {
    console.error('Failed to download template:', error)
    alert('下载模板失败，请重试')
  }
}

// 上传文件
const uploadFile = async () => {
  if (!selectedFile.value) return
  
  try {
    uploading.value = true
    importResult.value = null
    
    const response = await importAPI.uploadCSV(selectedFile.value)
    const result = response.data
    
    importResult.value = {
      success: true,
      success_count: result.success_count || 0,
      error_count: result.error_count || 0,
      total_count: result.total_count || 0,
      errors: result.errors || []
    }
    
    // 清除选中的文件
    clearFile()
    
    alert(`导入完成！成功导入${result.success_count || 0}条记录`)
  } catch (error) {
    console.error('Failed to upload file:', error)
    importResult.value = {
      success: false,
      error_count: 1,
      total_count: 1,
      errors: [{ row: 1, message: error.response?.data?.detail || '上传失败' }]
    }
    alert('文件上传失败，请检查文件格式和内容')
  } finally {
    uploading.value = false
  }
}

// 同步外部数据
const syncExternalData = async () => {
  try {
    syncing.value = true
    // 这里应该调用同步API，暂时使用模拟
    await new Promise(resolve => setTimeout(resolve, 2000))
    alert('数据同步完成')
  } catch (error) {
    console.error('Failed to sync external data:', error)
    alert('数据同步失败，请重试')
  } finally {
    syncing.value = false
  }
}
</script>
