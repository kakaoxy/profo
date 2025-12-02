<template>
  <div class="not-found-container">
    <div class="not-found-content">
      <h1 class="not-found-title">404</h1>
      <h2 class="not-found-subtitle">页面未找到</h2>
      <p class="not-found-message">抱歉，您访问的页面不存在或已被移除。</p>
      <div class="not-found-actions">
        <button class="btn btn-primary" @click="goHome">返回首页</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router'

const router = useRouter()

const goHome = () => {
  router.push({ name: 'home' })
}
</script>

<style scoped>
.not-found-container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  background-color: #f5f5f5;
}

.not-found-content {
  text-align: center;
  padding: 2rem;
  background-color: white;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.not-found-title {
  font-size: 8rem;
  font-weight: bold;
  margin: 0;
  color: #409eff;
}

.not-found-subtitle {
  font-size: 2rem;
  font-weight: 600;
  margin: 0.5rem 0;
  color: #303133;
}

.not-found-message {
  font-size: 1rem;
  color: #606266;
  margin: 1rem 0 2rem;
}

.not-found-actions {
  display: flex;
  justify-content: center;
  gap: 1rem;
}

.btn {
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 4px;
  font-size: 1rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.3s ease;
}

.btn-primary {
  background-color: #409eff;
  color: white;
}

.btn-primary:hover {
  background-color: #66b1ff;
}
</style>