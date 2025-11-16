<template>
  <div class="demo-container">
    <h1>Toast 组件演示</h1>
    
    <div class="button-grid">
      <button @click="showSuccessToast('操作成功！数据已保存')" class="btn btn-success">
        Success Toast
      </button>
      
      <button @click="showErrorToast('操作失败，请重试')" class="btn btn-error">
        Error Toast
      </button>
      
      <button @click="showWarningToast('请注意检查输入数据')" class="btn btn-warning">
        Warning Toast
      </button>
      
      <button @click="showInfoToast('正在处理中，请稍候...')" class="btn btn-info">
        Info Toast
      </button>
      
      <button @click="showMultiple" class="btn btn-multiple">
        Multiple Toasts
      </button>
      
      <button @click="showLongMessage" class="btn btn-long">
        Long Message
      </button>
    </div>
    
    <div class="info-section">
      <h2>使用说明</h2>
      <pre><code>import { useToast } from '@/composables/useToast'

const { showSuccessToast, showErrorToast, showWarningToast, showInfoToast } = useToast()

// 显示成功消息
showSuccessToast('操作成功！')

// 显示错误消息
showErrorToast('操作失败，请重试')

// 显示警告消息
showWarningToast('请注意检查输入')

// 显示信息消息
showInfoToast('正在处理中...')

// 自定义持续时间
showToast('自定义消息', 'info', 5000)</code></pre>
    </div>
    
    <Toast />
  </div>
</template>

<script setup lang="ts">
import { useToast } from '@/composables/useToast'
import Toast from './Toast.vue'

const { showSuccessToast, showErrorToast, showWarningToast, showInfoToast } = useToast()

const showMultiple = () => {
  showInfoToast('第一条消息')
  setTimeout(() => showSuccessToast('第二条消息'), 500)
  setTimeout(() => showWarningToast('第三条消息'), 1000)
  setTimeout(() => showErrorToast('第四条消息'), 1500)
}

const showLongMessage = () => {
  showInfoToast('这是一条很长的消息，用于测试 Toast 组件在显示长文本时的表现。系统会自动换行并保持良好的可读性。')
}
</script>

<style scoped>
.demo-container {
  max-width: 800px;
  margin: 2rem auto;
  padding: 2rem;
}

h1 {
  font-size: 2rem;
  font-weight: 700;
  color: #111827;
  margin-bottom: 2rem;
}

.button-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
  margin-bottom: 3rem;
}

.btn {
  padding: 0.75rem 1.5rem;
  border: none;
  border-radius: 0.5rem;
  font-size: 1rem;
  font-weight: 500;
  color: white;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
}

.btn-success {
  background-color: #10b981;
}

.btn-success:hover {
  background-color: #059669;
}

.btn-error {
  background-color: #ef4444;
}

.btn-error:hover {
  background-color: #dc2626;
}

.btn-warning {
  background-color: #f59e0b;
}

.btn-warning:hover {
  background-color: #d97706;
}

.btn-info {
  background-color: #3b82f6;
}

.btn-info:hover {
  background-color: #2563eb;
}

.btn-multiple {
  background-color: #8b5cf6;
}

.btn-multiple:hover {
  background-color: #7c3aed;
}

.btn-long {
  background-color: #ec4899;
}

.btn-long:hover {
  background-color: #db2777;
}

.info-section {
  background-color: #f9fafb;
  border-radius: 0.5rem;
  padding: 1.5rem;
}

h2 {
  font-size: 1.25rem;
  font-weight: 600;
  color: #111827;
  margin-bottom: 1rem;
}

pre {
  background-color: #1f2937;
  color: #f3f4f6;
  padding: 1rem;
  border-radius: 0.375rem;
  overflow-x: auto;
}

code {
  font-family: 'Courier New', monospace;
  font-size: 0.875rem;
  line-height: 1.5;
}
</style>
