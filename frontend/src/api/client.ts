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

apiClient.interceptors.response.use(
  (response) => {
    // Log successful response
    console.log(`[API Response] ${response.status} ${response.config.url}`, response.data);
    return response.data;
  },
  (error) => {
    // Enhanced error logging
    if (error.response) {
      // Server responded with a status code out of the range of 2xx
      console.error(`[API Error] ${error.response.status} ${error.config.url}`, error.response.data);
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
