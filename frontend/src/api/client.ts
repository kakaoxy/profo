import axios, { AxiosError, AxiosResponse } from 'axios'
import { useToast } from '@/composables/useToast'

// Create axios instance with base configuration
const apiClient = axios.create({
  baseURL: '/api',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json'
  }
})

// Request interceptor
apiClient.interceptors.request.use(
  (config) => {
    // Can add authentication token here if needed
    // For example: config.headers.Authorization = `Bearer ${token}`
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// Response interceptor
apiClient.interceptors.response.use(
  (response: AxiosResponse) => {
    // Return response data directly for easier consumption
    return response.data
  },
  (error: AxiosError) => {
    const { showErrorToast } = useToast()
    
    // Extract error message from response
    const status = error.response?.status
    const errorData = error.response?.data as any
    let message = errorData?.detail || '请求失败'
    
    // Handle specific HTTP status codes
    if (status === 400) {
      message = `请求参数错误: ${message}`
    } else if (status === 404) {
      message = '资源不存在'
    } else if (status === 500) {
      message = '服务器错误，请稍后重试'
    } else if (status === 503) {
      message = '服务暂时不可用，请稍后重试'
    } else if (error.code === 'ECONNABORTED') {
      message = '请求超时，请检查网络连接'
    } else if (error.code === 'ERR_NETWORK') {
      message = '网络连接失败，请检查网络设置'
    }
    
    // Show error toast notification
    showErrorToast(message)
    
    // Log error for debugging
    console.error('API Error:', {
      status,
      message,
      url: error.config?.url,
      method: error.config?.method
    })
    
    return Promise.reject(error)
  }
)

export default apiClient
