import { ref, computed } from 'vue'
import { authAPI } from '@/services/api'

// 全局状态管理
const user = ref(null)
const token = ref(null)
const isLoading = ref(false)

// 初始化时从localStorage恢复状态
const initAuth = () => {
  const savedToken = localStorage.getItem('access_token')
  const savedUser = localStorage.getItem('user')
  
  if (savedToken && savedUser) {
    token.value = savedToken
    user.value = JSON.parse(savedUser)
  }
}

// 计算属性
const isAuthenticated = computed(() => !!token.value)

// 登录
const login = async (credentials) => {
  try {
    isLoading.value = true
    const response = await authAPI.login(credentials)
    const { access_token, user: userData } = response.data
    
    // 保存到状态和localStorage
    token.value = access_token
    user.value = userData
    localStorage.setItem('access_token', access_token)
    localStorage.setItem('user', JSON.stringify(userData))
    
    return { success: true }
  } catch (error) {
    console.error('Login error:', error)
    return { 
      success: false, 
      message: error.response?.data?.detail || '登录失败' 
    }
  } finally {
    isLoading.value = false
  }
}

// 注册
const register = async (userData) => {
  try {
    isLoading.value = true
    const response = await authAPI.register(userData)
    const { access_token, user: newUser } = response.data
    
    // 注册成功后自动登录
    token.value = access_token
    user.value = newUser
    localStorage.setItem('access_token', access_token)
    localStorage.setItem('user', JSON.stringify(newUser))
    
    return { success: true }
  } catch (error) {
    console.error('Register error:', error)
    return { 
      success: false, 
      message: error.response?.data?.detail || '注册失败' 
    }
  } finally {
    isLoading.value = false
  }
}

// 登出
const logout = () => {
  token.value = null
  user.value = null
  localStorage.removeItem('access_token')
  localStorage.removeItem('user')
}

// 微信登录
const wechatLogin = async (code) => {
  try {
    isLoading.value = true
    const response = await authAPI.wechatLogin(code)
    const { access_token, user: userData } = response.data
    
    token.value = access_token
    user.value = userData
    localStorage.setItem('access_token', access_token)
    localStorage.setItem('user', JSON.stringify(userData))
    
    return { success: true }
  } catch (error) {
    console.error('WeChat login error:', error)
    return { 
      success: false, 
      message: error.response?.data?.detail || '微信登录失败' 
    }
  } finally {
    isLoading.value = false
  }
}

export {
  user,
  token,
  isLoading,
  isAuthenticated,
  initAuth,
  login,
  register,
  logout,
  wechatLogin
}
