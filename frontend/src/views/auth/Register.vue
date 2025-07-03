<template>
  <div class="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
    <div class="max-w-md w-full space-y-8">
      <div>
        <h2 class="mt-6 text-center text-3xl font-extrabold text-gray-900">
          创建新账户
        </h2>
        <p class="mt-2 text-center text-sm text-gray-600">
          或者
          <router-link to="/login" class="font-medium text-primary-600 hover:text-primary-500">
            登录已有账户
          </router-link>
        </p>
      </div>
      
      <form class="mt-8 space-y-6" @submit.prevent="handleRegister">
        <div class="space-y-4">
          <div>
            <label for="username" class="label">用户名</label>
            <input
              id="username"
              v-model="form.username"
              name="username"
              type="text"
              required
              class="input-field"
              placeholder="请输入用户名"
            />
          </div>
          
          <div>
            <label for="nickname" class="label">昵称</label>
            <input
              id="nickname"
              v-model="form.nickname"
              name="nickname"
              type="text"
              class="input-field"
              placeholder="请输入昵称（可选）"
            />
          </div>
          
          <div>
            <label for="phone" class="label">手机号</label>
            <input
              id="phone"
              v-model="form.phone"
              name="phone"
              type="tel"
              class="input-field"
              placeholder="请输入手机号（可选）"
            />
          </div>
          
          <div>
            <label for="password" class="label">密码</label>
            <input
              id="password"
              v-model="form.password"
              name="password"
              type="password"
              required
              class="input-field"
              placeholder="请输入密码"
            />
          </div>
          
          <div>
            <label for="confirmPassword" class="label">确认密码</label>
            <input
              id="confirmPassword"
              v-model="form.confirmPassword"
              name="confirmPassword"
              type="password"
              required
              class="input-field"
              placeholder="请再次输入密码"
            />
          </div>
        </div>

        <div class="flex items-center">
          <input
            id="agree-terms"
            v-model="form.agreeTerms"
            name="agree-terms"
            type="checkbox"
            required
            class="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
          />
          <label for="agree-terms" class="ml-2 block text-sm text-gray-900">
            我同意
            <a href="#" class="text-primary-600 hover:text-primary-500">服务条款</a>
            和
            <a href="#" class="text-primary-600 hover:text-primary-500">隐私政策</a>
          </label>
        </div>

        <div>
          <button
            type="submit"
            :disabled="isLoading || !isFormValid"
            class="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span v-if="isLoading" class="flex items-center justify-center">
              <svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              注册中...
            </span>
            <span v-else>注册</span>
          </button>
        </div>

        <!-- 错误提示 -->
        <div v-if="error" class="rounded-md bg-red-50 p-4">
          <div class="flex">
            <div class="flex-shrink-0">
              <ExclamationTriangleIcon class="h-5 w-5 text-red-400" />
            </div>
            <div class="ml-3">
              <h3 class="text-sm font-medium text-red-800">
                注册失败
              </h3>
              <div class="mt-2 text-sm text-red-700">
                {{ error }}
              </div>
            </div>
          </div>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed } from 'vue'
import { useRouter } from 'vue-router'
import { ExclamationTriangleIcon } from '@heroicons/vue/24/outline'
import { register, isLoading } from '@/stores/auth'

const router = useRouter()
const error = ref('')

const form = reactive({
  username: '',
  nickname: '',
  phone: '',
  password: '',
  confirmPassword: '',
  agreeTerms: false
})

const isFormValid = computed(() => {
  return form.username && 
         form.password && 
         form.confirmPassword && 
         form.password === form.confirmPassword &&
         form.agreeTerms
})

const handleRegister = async () => {
  error.value = ''
  
  if (form.password !== form.confirmPassword) {
    error.value = '两次输入的密码不一致'
    return
  }
  
  const result = await register({
    username: form.username,
    password: form.password,
    nickname: form.nickname || form.username,
    phone: form.phone || null
  })
  
  if (result.success) {
    router.push('/')
  } else {
    error.value = result.message
  }
}
</script>
