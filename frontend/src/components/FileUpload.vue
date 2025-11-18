<template>
  <div class="file-upload-container">
    <!-- Upload Area -->
    <div
      :class="['upload-area', { 'dragging': isDragging, 'uploading': isUploading }]"
      @drop.prevent="handleDrop"
      @dragover.prevent="handleDragOver"
      @dragenter.prevent="handleDragEnter"
      @dragleave.prevent="handleDragLeave"
      @click="triggerFileInput"
    >
      <input
        ref="fileInputRef"
        type="file"
        accept=".csv"
        @change="handleFileSelect"
        hidden
      />

      <!-- Upload Prompt -->
      <div v-if="!isUploading && !uploadResult" class="upload-prompt">
        <svg class="upload-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
          <polyline points="17 8 12 3 7 8"></polyline>
          <line x1="12" y1="3" x2="12" y2="15"></line>
        </svg>
        <p class="prompt-title">将 CSV 文件拖拽至此区域</p>
        <p class="prompt-subtitle">或</p>
        <button class="select-file-btn" @click.stop="triggerFileInput">
          点击选择文件
        </button>
        <p class="prompt-hint">仅支持 .csv 格式文件</p>
        <button class="template-btn" @click.stop="downloadCsvTemplate">
          下载示例模板
        </button>
      </div>

      <!-- Upload Progress -->
      <div v-if="isUploading" class="upload-progress">
        <svg class="progress-icon spinner" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"></circle>
        </svg>
        <p class="progress-text">正在上传 {{ fileName }}...</p>
        <div class="progress-bar-container">
          <div class="progress-bar" :style="{ width: `${uploadProgress}%` }"></div>
        </div>
        <p class="progress-percent">{{ uploadProgress }}%</p>
      </div>
    </div>

    <!-- Upload Result -->
    <div v-if="uploadResult && !isUploading" class="upload-result">
      <div class="result-header">
        <svg 
          v-if="uploadResult.failed === 0" 
          class="result-icon success" 
          xmlns="http://www.w3.org/2000/svg" 
          viewBox="0 0 24 24" 
          fill="none" 
          stroke="currentColor" 
          stroke-width="2"
        >
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
          <polyline points="22 4 12 14.01 9 11.01"></polyline>
        </svg>
        <svg 
          v-else 
          class="result-icon warning" 
          xmlns="http://www.w3.org/2000/svg" 
          viewBox="0 0 24 24" 
          fill="none" 
          stroke="currentColor" 
          stroke-width="2"
        >
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
          <line x1="12" y1="9" x2="12" y2="13"></line>
          <line x1="12" y1="17" x2="12.01" y2="17"></line>
        </svg>
        <h3 class="result-title">上传完成</h3>
      </div>

      <div class="result-stats">
        <div class="stat-item">
          <span class="stat-label">总记录数</span>
          <span class="stat-value">{{ uploadResult.total }}</span>
        </div>
        <div class="stat-item success">
          <span class="stat-label">成功导入</span>
          <span class="stat-value">{{ uploadResult.success }}</span>
        </div>
        <div class="stat-item" :class="{ 'error': uploadResult.failed > 0 }">
          <span class="stat-label">失败记录</span>
          <span class="stat-value">{{ uploadResult.failed }}</span>
        </div>
      </div>

      <!-- Failed Records Download Link -->
      <div v-if="uploadResult.failed > 0 && uploadResult.failed_file_url" class="failed-records-section">
        <p class="failed-records-text">
          有 {{ uploadResult.failed }} 条记录导入失败，您可以下载失败记录文件查看详情
        </p>
        <a 
          :href="uploadResult.failed_file_url" 
          download 
          class="download-failed-btn"
        >
          <svg class="btn-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="7 10 12 15 17 10"></polyline>
            <line x1="12" y1="15" x2="12" y2="3"></line>
          </svg>
          下载失败记录
        </a>
      </div>

      <!-- Upload Another File Button -->
      <button class="upload-another-btn" @click="resetUpload">
        <svg class="btn-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="1 4 1 10 7 10"></polyline>
          <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>
        </svg>
        上传另一个文件
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { uploadCSV } from '@/api/upload'
import { useToast } from '@/composables/useToast'
import { validateFileUpload } from '@/utils/validation'
import type { UploadResult } from '@/api/types'

const { showSuccessToast, showErrorToast } = useToast()

// Refs
const fileInputRef = ref<HTMLInputElement | null>(null)
const isDragging = ref(false)
const isUploading = ref(false)
const uploadProgress = ref(0)
const fileName = ref('')
const uploadResult = ref<UploadResult | null>(null)

// Emits
const emit = defineEmits<{
  'upload-success': [result: UploadResult]
  'upload-error': [error: Error]
}>()

// Methods
const triggerFileInput = () => {
  if (!isUploading.value) {
    fileInputRef.value?.click()
  }
}

const downloadCsvTemplate = () => {
  const headers = [
    '数据源','房源ID','状态','小区名','室','厅','卫','朝向','楼层','面积','套内面积',
    '挂牌价','上架时间','成交价','成交时间','物业类型','建筑年代','建筑结构','装修情况','电梯',
    '产权性质','产权年限','上次交易','供暖方式','房源描述','城市ID','行政区','商圈'
  ]
  const requirementRow = [
    '必填','必填','必填','必填','必填','可选','可选','必填','必填','必填','可选',
    '在售必填','在售必填','成交必填','成交必填','可选','可选','可选','可选','可选',
    '可选','可选','可选','可选','可选','可选','可选','可选'
  ]
  const sampleForSale = [
    '链家','LJ0001','在售','阳光花园','3','2','1','南','高楼层/18','98.5','',
    '520','2024-01-15','', '', '普通住宅','2008','钢混','精装','true',
    '商品房','70','2022-06','集中供暖','满五唯一，采光好','310000','浦东新区','陆家嘴'
  ]
  const sampleSold = [
    '贝壳','BK1002','成交','城市经典','2','2','1','南北','中楼层/12','86.2','',
    '', '', '480','2024-03-02','普通住宅','2012','钢混','简装','false',
    '商品房','70','2021-12','集中供暖','学区房','310000','静安区','南京西路'
  ]
  const rows = [headers, requirementRow, sampleForSale, sampleSold]
  const csv = rows.map(r => r.map(v => {
    const s = String(v ?? '')
    return s.includes(',') || s.includes('"') || s.includes('\n') ? '"' + s.replace(/"/g,'""') + '"' : s
  }).join(',')).join('\n')
  const blob = new Blob([new Uint8Array([0xEF,0xBB,0xBF]), csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `房源导入示例模板_${Date.now()}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

const handleDragEnter = () => {
  if (!isUploading.value) {
    isDragging.value = true
  }
}

const handleDragOver = () => {
  if (!isUploading.value) {
    isDragging.value = true
  }
}

const handleDragLeave = (event: DragEvent) => {
  // Only set to false if leaving the upload area itself
  if (event.target === event.currentTarget) {
    isDragging.value = false
  }
}

const handleDrop = (event: DragEvent) => {
  isDragging.value = false
  
  if (isUploading.value) return
  
  const files = event.dataTransfer?.files
  if (files && files.length > 0) {
    const file = files[0]
    validateAndUpload(file)
  }
}

const handleFileSelect = (event: Event) => {
  const target = event.target as HTMLInputElement
  const files = target.files
  
  if (files && files.length > 0) {
    const file = files[0]
    validateAndUpload(file)
  }
  
  // Reset input value to allow selecting the same file again
  target.value = ''
}

const validateAndUpload = (file: File) => {
  // Use centralized validation
  const validation = validateFileUpload(file)
  if (!validation.valid) {
    return
  }
  
  uploadFile(file)
}

const uploadFile = async (file: File) => {
  isUploading.value = true
  uploadProgress.value = 0
  fileName.value = file.name
  uploadResult.value = null
  
  try {
    const result = await uploadCSV(file, (progress) => {
      uploadProgress.value = progress
    })
    
    uploadResult.value = result
    
    // Show success message
    if (result.failed === 0) {
      showSuccessToast(`上传成功！共导入 ${result.success} 条记录`)
    } else {
      showSuccessToast(`上传完成！成功 ${result.success} 条，失败 ${result.failed} 条`)
    }
    
    // Emit success event
    emit('upload-success', result)
  } catch (error) {
    showErrorToast('上传失败，请重试')
    emit('upload-error', error as Error)
  } finally {
    isUploading.value = false
  }
}

const resetUpload = () => {
  uploadResult.value = null
  uploadProgress.value = 0
  fileName.value = ''
}
</script>

<style scoped>
.file-upload-container {
  width: 100%;
  max-width: 800px;
  margin: 0 auto;
}

/* Upload Area */
.upload-area {
  border: 2px dashed #d1d5db;
  border-radius: 0.75rem;
  padding: 3rem 2rem;
  text-align: center;
  background-color: #ffffff;
  cursor: pointer;
  transition: all 0.3s ease;
  box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1);
}

.upload-area:hover:not(.uploading) {
  border-color: #3b82f6;
  background-color: #eff6ff;
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.15);
}

.upload-area.dragging {
  border-color: #3b82f6;
  background-color: #dbeafe;
  transform: scale(1.02);
  box-shadow: 0 8px 24px rgba(59, 130, 246, 0.25);
}

.upload-area.uploading {
  cursor: not-allowed;
  border-color: #9ca3af;
}

/* Upload Prompt */
.upload-prompt {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
}

.upload-icon {
  width: 4rem;
  height: 4rem;
  color: #9ca3af;
  margin-bottom: 0.5rem;
}

.prompt-title {
  font-size: 1.125rem;
  font-weight: 600;
  color: #374151;
  margin: 0;
}

.prompt-subtitle {
  font-size: 0.875rem;
  color: #6b7280;
  margin: 0;
}

.select-file-btn {
  padding: 0.625rem 1.5rem;
  background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
  color: white;
  border: none;
  border-radius: 0.375rem;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 2px 4px rgba(59, 130, 246, 0.3);
}

.select-file-btn:hover {
  background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
  transform: translateY(-2px);
  box-shadow: 0 6px 12px rgba(59, 130, 246, 0.4);
}

.select-file-btn:active {
  transform: translateY(0);
}

.prompt-hint {
  font-size: 0.75rem;
  color: #9ca3af;
  margin: 0;
}

.template-btn {
  padding: 0.5rem 0.75rem;
  background-color: #10b981;
  color: #ffffff;
  border: none;
  border-radius: 0.375rem;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
}

.template-btn:hover {
  background-color: #059669;
}

/* Upload Progress */
.upload-progress {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
}

.progress-icon {
  width: 3rem;
  height: 3rem;
  color: #3b82f6;
}

.spinner {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.progress-text {
  font-size: 1rem;
  font-weight: 500;
  color: #374151;
  margin: 0;
}

.progress-bar-container {
  width: 100%;
  max-width: 400px;
  height: 0.5rem;
  background-color: #e5e7eb;
  border-radius: 9999px;
  overflow: hidden;
}

.progress-bar {
  height: 100%;
  background-color: #3b82f6;
  transition: width 0.3s ease;
  border-radius: 9999px;
}

.progress-percent {
  font-size: 0.875rem;
  font-weight: 600;
  color: #3b82f6;
  margin: 0;
}

/* Upload Result */
.upload-result {
  margin-top: 2rem;
  padding: 2rem;
  background-color: #ffffff;
  border-radius: 0.75rem;
  box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1);
}

.result-header {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.result-icon {
  width: 2.5rem;
  height: 2.5rem;
  flex-shrink: 0;
}

.result-icon.success {
  color: #10b981;
}

.result-icon.warning {
  color: #f59e0b;
}

.result-title {
  font-size: 1.5rem;
  font-weight: 700;
  color: #111827;
  margin: 0;
}

/* Result Stats */
.result-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.stat-item {
  padding: 1rem;
  background-color: #f9fafb;
  border-radius: 0.5rem;
  text-align: center;
  border: 2px solid #e5e7eb;
}

.stat-item.success {
  background-color: #d1fae5;
  border-color: #10b981;
}

.stat-item.error {
  background-color: #fee2e2;
  border-color: #ef4444;
}

.stat-label {
  display: block;
  font-size: 0.875rem;
  color: #6b7280;
  margin-bottom: 0.5rem;
}

.stat-value {
  display: block;
  font-size: 1.875rem;
  font-weight: 700;
  color: #111827;
}

/* Failed Records Section */
.failed-records-section {
  padding: 1rem;
  background-color: #fef3c7;
  border-left: 4px solid #f59e0b;
  border-radius: 0.375rem;
  margin-bottom: 1.5rem;
}

.failed-records-text {
  font-size: 0.875rem;
  color: #92400e;
  margin: 0 0 1rem 0;
}

.download-failed-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  background-color: #f59e0b;
  color: white;
  border: none;
  border-radius: 0.375rem;
  font-size: 0.875rem;
  font-weight: 500;
  text-decoration: none;
  cursor: pointer;
  transition: all 0.2s ease;
}

.download-failed-btn:hover {
  background-color: #d97706;
  transform: translateY(-1px);
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
}

.btn-icon {
  width: 1rem;
  height: 1rem;
}

/* Upload Another Button */
.upload-another-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.625rem 1.25rem;
  background-color: #3b82f6;
  color: white;
  border: none;
  border-radius: 0.375rem;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.upload-another-btn:hover {
  background-color: #2563eb;
  transform: translateY(-1px);
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
}

.upload-another-btn:active {
  transform: translateY(0);
}

/* Responsive Design */
@media (max-width: 640px) {
  .upload-area {
    padding: 2rem 1rem;
  }
  
  .result-stats {
    grid-template-columns: 1fr;
  }
  
  .upload-icon {
    width: 3rem;
    height: 3rem;
  }
}
</style>
