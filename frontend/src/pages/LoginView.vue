<template>
  <div class="login-container">
    <div class="login-card">
      <div class="login-header">
        <h1 class="login-title">Profo 房产数据中心</h1>
        <p class="login-subtitle">请登录您的账户</p>
      </div>
      
      <div class="login-form">
        <!-- Error message -->
        <div v-if="authStore.error" class="error-message">
          {{ authStore.error }}
        </div>
        
        <!-- Username input -->
        <div class="form-group">
          <label for="username" class="form-label">用户名</label>
          <input
            id="username"
            v-model="loginForm.username"
            type="text"
            class="form-input"
            placeholder="请输入用户名"
            required
            @keyup.enter="handleLogin"
          />
        </div>
        
        <!-- Password input -->
        <div class="form-group">
          <label for="password" class="form-label">密码</label>
          <input
            id="password"
            v-model="loginForm.password"
            type="password"
            class="form-input"
            placeholder="请输入密码"
            required
            @keyup.enter="handleLogin"
          />
        </div>
        
        <!-- Login button -->
        <button
          class="btn btn-primary btn-block"
          :disabled="authStore.isLoading || !isFormValid"
          @click="handleLogin"
        >
          <span v-if="authStore.isLoading">登录中...</span>
          <span v-else>登录</span>
        </button>
        
        <!-- Divider -->
        <div class="divider">
          <span class="divider-text">或</span>
        </div>
        
        <!-- WeChat login button -->
        <button
          class="btn btn-wechat btn-block"
          :disabled="authStore.isLoading"
          @click="handleWechatLogin"
        >
          <svg class="wechat-icon" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm-1.6 19.59c-1.59 0-3.07-.6-4.16-1.63-.5-.52-.9-1.1-1.17-1.75-.09-.2-.13-.4-.13-.61 0-.5.22-1 .61-1.37.4-.37.91-.58 1.51-.58.34 0 .65.1.91.29.26.18.47.44.61.76.2.55.62 1.02 1.26 1.41.64.38 1.35.58 2.11.58 1.65 0 3.01-.65 4.06-1.95l-1.49-.92c-.52.75-1.19 1.19-2.02 1.19-.53 0-.98-.19-1.36-.58-.39-.38-.59-.84-.59-1.38 0-.53.2-1 .59-1.38.37-.37.83-.56 1.36-.56.83 0 1.49.43 2.02 1.19l1.5-.91c-.65-.98-1.52-1.74-2.63-2.27-.37-.17-.78-.3-1.21-.39-.43-.09-.88-.14-1.34-.14-.5 0-.97.06-1.42.18-.45.12-.87.3-1.24.53-.37.23-.68.51-.94.83-.26.32-.46.68-.59 1.09-.13.42-.2 1.01-.2 1.75 0 .67.07 1.24.2 1.71.13.47.32.88.57 1.23.25.35.54.65.87.89.33.24.69.44 1.09.6.4.16.83.24 1.3.24.46 0 .91-.08 1.34-.24.43-.17.83-.37 1.21-.6.39-.23.71-.5.98-.82.27-.32.49-.68.65-1.08.16-.4.24-.85.24-1.36 0-.5-.08-.96-.24-1.36-.17-.4-.39-.76-.68-1.07-.29-.31-.62-.56-.99-.76-.37-.2-.78-.35-1.22-.45-.44-.1-.89-.15-1.36-.15-.47 0-.92.05-1.36.15-.43.1-.85.25-1.22.45-.38.2-.71.46-.99.76-.28.31-.5.67-.67 1.07-.17.4-.25.85-.25 1.36 0 .47.08.92.25 1.33.17.41.39.77.67 1.09.3.32.64.57 1.02.76.38.19.8.34 1.27.45.46.11.93.16 1.41.16.53 0 1.02-.06 1.48-.17.45-.11.88-.26 1.27-.45.39-.19.73-.44 1.02-.76.29-.32.51-.68.67-1.09.16-.41.25-.86.25-1.33 0-.53-.09-1.04-.25-1.52-.17-.48-.39-.92-.67-1.32-.28-.4-.61-.76-1-.99-.39-.23-.82-.41-1.28-.55-.46-.14-.93-.21-1.42-.21-.55 0-1.07.08-1.57.23-.5.15-.96.36-1.35.63-.39.27-.72.6-.99.99-.27.39-.49.82-.65 1.29-.16.47-.25.99-.25 1.56 0 .61.09 1.16.25 1.66.17.5.39.95.65 1.35.26.4.6.73.99 1.01.39.28.83.5 1.31.67.48.17.99.26 1.53.26z"/>
          </svg>
          微信登录
        </button>
        
        <!-- Forgot password (optional) -->
        <div class="login-footer">
          <a href="#" class="forgot-password">忘记密码？</a>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAuthStore } from '../stores/auth';

// Get auth store
const authStore = useAuthStore();

// Get router and route
const router = useRouter();
const route = useRoute();

// Login form data
const loginForm = ref({
  username: '',
  password: ''
});

// Form validation
const isFormValid = computed(() => {
  return loginForm.value.username.trim() && loginForm.value.password.trim();
});

// Handle login
const handleLogin = async () => {
  if (!isFormValid.value) return;
  
  try {
    await authStore.login(loginForm.value);
    
    // Get redirect path from query parameter or default to home
    const redirectPath = route.query.redirect as string || '/';
    
    // Redirect to the intended page
    router.push(redirectPath);
  } catch (error) {
    // Error is handled by the auth store
    console.error('Login failed:', error);
  }
};

// Handle WeChat login
const handleWechatLogin = () => {
  // Redirect to WeChat authorization URL
  window.location.href = '/api/auth/wechat/authorize';
};
</script>

<style scoped>
.login-container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  background-color: #f5f7fa;
  padding: 1rem;
}

.login-card {
  width: 100%;
  max-width: 400px;
  background-color: white;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  padding: 2rem;
}

.login-header {
  text-align: center;
  margin-bottom: 2rem;
}

.login-title {
  font-size: 1.8rem;
  font-weight: bold;
  color: #303133;
  margin: 0 0 0.5rem 0;
}

.login-subtitle {
  font-size: 1rem;
  color: #606266;
  margin: 0;
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.error-message {
  background-color: #fef0f0;
  color: #f56c6c;
  padding: 0.75rem;
  border-radius: 4px;
  font-size: 0.875rem;
  text-align: center;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.form-label {
  font-size: 0.875rem;
  font-weight: 500;
  color: #303133;
}

.form-input {
  padding: 0.75rem;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  font-size: 1rem;
  transition: border-color 0.3s ease;
}

.form-input:focus {
  outline: none;
  border-color: #409eff;
  box-shadow: 0 0 0 2px rgba(64, 158, 255, 0.1);
}

.form-input::placeholder {
  color: #c0c4cc;
}

.btn {
  padding: 0.75rem;
  border: none;
  border-radius: 4px;
  font-size: 1rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.3s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-block {
  width: 100%;
}

.btn-primary {
  background-color: #409eff;
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background-color: #66b1ff;
}

.btn-wechat {
  background-color: #07c160;
  color: white;
}

.btn-wechat:hover:not(:disabled) {
  background-color: #36d399;
}

.wechat-icon {
  width: 1.25rem;
  height: 1.25rem;
}

.divider {
  display: flex;
  align-items: center;
  text-align: center;
  margin: 1rem 0;
}

.divider::before,
.divider::after {
  content: '';
  flex: 1;
  border-bottom: 1px solid #dcdfe6;
}

.divider-text {
  padding: 0 1rem;
  color: #909399;
  font-size: 0.875rem;
}

.login-footer {
  text-align: center;
  margin-top: 1rem;
}

.forgot-password {
  color: #409eff;
  font-size: 0.875rem;
  text-decoration: none;
}

.forgot-password:hover {
  color: #66b1ff;
  text-decoration: underline;
}
</style>