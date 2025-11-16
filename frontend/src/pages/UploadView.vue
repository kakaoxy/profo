<template>
  <div class="upload-view">
    <div class="upload-container">
      <h1 class="page-title">CSV 文件上传</h1>
      <p class="page-description">
        上传 CSV 文件批量导入房源数据。系统将自动验证数据格式并导入到数据库中。
      </p>
      
      <FileUpload 
        @upload-success="handleUploadSuccess"
        @upload-error="handleUploadError"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { useErrorBoundary } from '@/composables/useErrorBoundary'
import FileUpload from '@/components/FileUpload.vue'
import type { UploadResult } from '@/api/types'

// Setup error boundary for this component
useErrorBoundary('数据上传页')

const handleUploadSuccess = (result: UploadResult) => {
  console.log('Upload successful:', result)
  // Additional handling can be added here if needed
}

const handleUploadError = (error: Error) => {
  console.error('Upload failed:', error)
  // Additional error handling can be added here if needed
}
</script>

<style scoped>
.upload-view {
  width: 100%;
  min-height: 100vh;
  background-color: #f5f5f5;
  padding: 2rem 1rem;
}

.upload-container {
  max-width: 1200px;
  margin: 0 auto;
}

.page-title {
  font-size: 2rem;
  font-weight: 700;
  color: #111827;
  margin-bottom: 0.5rem;
}

.page-description {
  font-size: 1rem;
  color: #6b7280;
  margin-bottom: 2rem;
}

@media (max-width: 640px) {
  .upload-view {
    padding: 1rem 0.5rem;
  }
  
  .page-title {
    font-size: 1.5rem;
  }
  
  .page-description {
    font-size: 0.875rem;
  }
}
</style>
