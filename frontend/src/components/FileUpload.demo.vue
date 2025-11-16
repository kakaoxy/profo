<template>
  <div class="demo-container">
    <h1 class="demo-title">FileUpload Component Demo</h1>
    <p class="demo-description">
      This demo showcases the FileUpload component with all its features.
    </p>

    <div class="demo-section">
      <h2 class="section-title">Basic Usage</h2>
      <FileUpload 
        @upload-success="handleUploadSuccess"
        @upload-error="handleUploadError"
      />
    </div>

    <div v-if="lastResult" class="demo-section">
      <h2 class="section-title">Last Upload Result (Console Log)</h2>
      <pre class="result-display">{{ JSON.stringify(lastResult, null, 2) }}</pre>
    </div>

    <div class="demo-section">
      <h2 class="section-title">Features</h2>
      <ul class="feature-list">
        <li>✅ Drag and drop CSV files</li>
        <li>✅ Click to select files</li>
        <li>✅ File type validation (.csv only)</li>
        <li>✅ File size validation (max 50MB)</li>
        <li>✅ Real-time upload progress</li>
        <li>✅ Success/failure statistics</li>
        <li>✅ Download failed records CSV</li>
        <li>✅ Upload another file option</li>
        <li>✅ Responsive design</li>
        <li>✅ Toast notifications</li>
      </ul>
    </div>

    <div class="demo-section">
      <h2 class="section-title">Usage Instructions</h2>
      <ol class="instruction-list">
        <li>Prepare a CSV file with property data</li>
        <li>Either drag the file onto the upload area or click to select</li>
        <li>Wait for the upload to complete</li>
        <li>Review the upload statistics</li>
        <li>If there are failed records, download the failed records CSV</li>
        <li>Click "Upload another file" to upload more data</li>
      </ol>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import FileUpload from '@/components/FileUpload.vue'
import type { UploadResult } from '@/api/types'

const lastResult = ref<UploadResult | null>(null)

const handleUploadSuccess = (result: UploadResult) => {
  console.log('Upload successful:', result)
  lastResult.value = result
}

const handleUploadError = (error: Error) => {
  console.error('Upload failed:', error)
}
</script>

<style scoped>
.demo-container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 2rem;
  background-color: #f9fafb;
  min-height: 100vh;
}

.demo-title {
  font-size: 2.5rem;
  font-weight: 700;
  color: #111827;
  margin-bottom: 0.5rem;
}

.demo-description {
  font-size: 1.125rem;
  color: #6b7280;
  margin-bottom: 2rem;
}

.demo-section {
  background-color: white;
  padding: 2rem;
  border-radius: 0.75rem;
  margin-bottom: 2rem;
  box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1);
}

.section-title {
  font-size: 1.5rem;
  font-weight: 600;
  color: #111827;
  margin-bottom: 1rem;
}

.result-display {
  background-color: #1f2937;
  color: #10b981;
  padding: 1rem;
  border-radius: 0.5rem;
  overflow-x: auto;
  font-family: 'Courier New', monospace;
  font-size: 0.875rem;
}

.feature-list,
.instruction-list {
  margin: 0;
  padding-left: 1.5rem;
}

.feature-list li,
.instruction-list li {
  margin-bottom: 0.5rem;
  color: #374151;
  line-height: 1.6;
}

.feature-list li {
  list-style: none;
  padding-left: 0;
}

@media (max-width: 640px) {
  .demo-container {
    padding: 1rem;
  }
  
  .demo-title {
    font-size: 1.75rem;
  }
  
  .demo-section {
    padding: 1rem;
  }
}
</style>
