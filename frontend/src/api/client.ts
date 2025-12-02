import axios from 'axios'
// import { useToast } from '@/composables/useToast'

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
    // Add auth token to request headers
    const accessToken = localStorage.getItem('access_token')
    if (accessToken) {
      config.headers.Authorization = `Bearer ${accessToken}`
    }
    
    // Log request details for debugging
    console.log(`[API Request] ${config.method?.toUpperCase()} ${config.url}`, {
      params: config.params,
      headers: config.headers,
    });
    return config;
  },
  (error) => {
    console.error('[API Request Error]', error);
    return Promise.reject(error);
  }
);

// Response interceptor
apiClient.interceptors.response.use(
  (response) => {
    // Log successful response
    console.log(`[API Response] ${response.status} ${response.config.url}`, response.data);
    return response.data;
  },
  async (error) => {
    // Enhanced error logging
    if (error.response) {
      // Server responded with a status code out of the range of 2xx
      console.error(`[API Error] ${error.response.status} ${error.config.url}`, error.response.data);
      
      // Handle 401 Unauthorized - token expired
      if (error.response.status === 401 && error.config.url !== '/api/auth/refresh') {
        try {
          // Try to refresh token
          const refreshToken = localStorage.getItem('refresh_token');
          if (refreshToken) {
            const response = await axios.post('/api/auth/refresh', {
              refresh_token: refreshToken
            });
            
            // Store new tokens
            const { access_token, refresh_token } = response.data;
            localStorage.setItem('access_token', access_token);
            localStorage.setItem('refresh_token', refresh_token);
            
            // Retry original request with new token
            error.config.headers.Authorization = `Bearer ${access_token}`;
            return apiClient(error.config);
          }
        } catch (refreshError) {
          // If refresh fails, clear tokens and redirect to login
          localStorage.removeItem('access_token');
          localStorage.removeItem('refresh_token');
          
          // Redirect to login page
          window.location.href = '/login';
          
          return Promise.reject(refreshError);
        }
      }
    } else if (error.request) {
      // The request was made but no response was received
      console.error('[API Error] No response received', error.request);
    } else {
      // Something happened in setting up the request that triggered an Error
      console.error('[API Error] Request setup failed', error.message);
    }
    return Promise.reject(error);
  }
);

export default apiClient
