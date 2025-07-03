import axios from 'axios'

// 创建axios实例
const api = axios.create({
  baseURL: 'http://localhost:8000/api/v1',
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  }
})

// 请求拦截器 - 添加认证token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('access_token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// 响应拦截器 - 处理错误
api.interceptors.response.use(
  (response) => {
    return response
  },
  (error) => {
    if (error.response?.status === 401) {
      // Token过期或无效，清除本地存储并跳转到登录页
      localStorage.removeItem('access_token')
      localStorage.removeItem('user')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

// 认证相关API
export const authAPI = {
  login: (credentials) => api.post('/auth/login', credentials),
  register: (userData) => api.post('/auth/register', userData),
  wechatLogin: (code) => api.post('/auth/wechat-login', { code })
}

// 房源管理API
export const propertyAPI = {
  getProperties: (params) => api.get('/properties', { params }),
  getProperty: (id) => api.get(`/properties/${id}`),
  createProperty: (data) => api.post('/properties', data),
  updateProperty: (id, data) => api.put(`/properties/${id}`, data),
  deleteProperty: (id) => api.delete(`/properties/${id}`)
}

// 个人看房管理API
export const viewingAPI = {
  getViewings: (params) => api.get('/my-viewings', { params }),
  getViewing: (id) => api.get(`/my-viewings/${id}`),
  createViewing: (data) => api.post('/my-viewings', data),
  updateViewing: (id, data) => api.put(`/my-viewings/${id}`, data),
  deleteViewing: (id) => api.delete(`/my-viewings/${id}`)
}

// 数据看板API
export const dashboardAPI = {
  getOverview: () => api.get('/dashboard/stats/overview'),
  getTrend: (days = 30) => api.get('/dashboard/stats/trend', { params: { days } })
}

// 数据导入API
export const importAPI = {
  uploadCSV: (file) => {
    const formData = new FormData()
    formData.append('file', file)
    return api.post('/data-import/csv/properties', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    })
  },
  getTemplate: () => api.get('/data-import/csv/template/properties')
}

// 小区管理API
export const communityAPI = {
  getCommunities: (params) => api.get('/communities', { params }),
  getCommunity: (id) => api.get(`/communities/${id}`),
  createCommunity: (data) => api.post('/communities', data),
  updateCommunity: (id, data) => api.put(`/communities/${id}`, data),
  deleteCommunity: (id) => api.delete(`/communities/${id}`)
}

// 经纪人管理API
export const agentAPI = {
  getAgents: (params) => api.get('/agents', { params }),
  getAgent: (id) => api.get(`/agents/${id}`),
  createAgent: (data) => api.post('/agents', data),
  updateAgent: (id, data) => api.put(`/agents/${id}`, data),
  deleteAgent: (id) => api.delete(`/agents/${id}`)
}

// 城市管理API
export const cityAPI = {
  getCities: () => api.get('/cities'),
  getCity: (id) => api.get(`/cities/${id}`),
  createCity: (data) => api.post('/cities', data),
  updateCity: (id, data) => api.put(`/cities/${id}`, data),
  deleteCity: (id) => api.delete(`/cities/${id}`)
}

// 中介公司管理API
export const agencyAPI = {
  getAgencies: () => api.get('/agencies'),
  getAgency: (id) => api.get(`/agencies/${id}`),
  createAgency: (data) => api.post('/agencies', data),
  updateAgency: (id, data) => api.put(`/agencies/${id}`, data),
  deleteAgency: (id) => api.delete(`/agencies/${id}`)
}

export default api
