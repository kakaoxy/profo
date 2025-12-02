import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import apiClient from '../api/client';

// Define user and role interfaces
interface Role {
  id: string;
  name: string;
  code: string;
  description: string;
  permissions: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface User {
  id: string;
  username: string;
  nickname: string;
  avatar: string;
  phone: string;
  role_id: string;
  role: Role;
  status: string;
  last_login_at: string;
  created_at: string;
  updated_at: string;
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  user: User;
}

// Define login request interface
interface LoginRequest {
  username: string;
  password: string;
}

// Create the auth store
export const useAuthStore = defineStore('auth', () => {
  // State
  const accessToken = ref<string | null>(localStorage.getItem('access_token'));
  const refreshToken = ref<string | null>(localStorage.getItem('refresh_token'));
  const user = ref<User | null>(null);
  const isLoading = ref<boolean>(false);
  const error = ref<string | null>(null);

  // Computed
  const isAuthenticated = computed(() => !!accessToken.value);
  const userRole = computed(() => user.value?.role.code || null);
  const userPermissions = computed(() => user.value?.role.permissions || []);

  // Actions
  const setTokens = (newAccessToken: string, newRefreshToken: string) => {
    accessToken.value = newAccessToken;
    refreshToken.value = newRefreshToken;
    localStorage.setItem('access_token', newAccessToken);
    localStorage.setItem('refresh_token', newRefreshToken);
  };

  const clearTokens = () => {
    accessToken.value = null;
    refreshToken.value = null;
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
  };

  const setUser = (newUser: User) => {
    user.value = newUser;
  };

  const clearUser = () => {
    user.value = null;
  };

  const login = async (loginData: LoginRequest): Promise<void> => {
    isLoading.value = true;
    error.value = null;
    
    try {
      // apiClient.post returns TokenResponse directly due to interceptor
      const response = await apiClient.post('/auth/login', loginData) as unknown as TokenResponse;
      
      // Store tokens and user info
      setTokens(response.access_token, response.refresh_token);
      setUser(response.user);
    } catch (err: any) {
      error.value = err.response?.data?.detail || '登录失败，请检查用户名和密码';
      throw err;
    } finally {
      isLoading.value = false;
    }
  };

  const logout = () => {
    clearTokens();
    clearUser();
  };

  const refreshAccessToken = async (): Promise<boolean> => {
    if (!refreshToken.value) {
      return false;
    }
    
    try {
      // apiClient.post returns TokenResponse directly due to interceptor
      const response = await apiClient.post('/auth/refresh', {
        refresh_token: refreshToken.value
      }) as unknown as TokenResponse;
      
      // Update tokens
      setTokens(response.access_token, response.refresh_token);
      return true;
    } catch (err) {
      // If refresh fails, don't logout immediately, just return false
      // Let the caller decide what to do
      return false;
    }
  };

  const fetchCurrentUser = async (): Promise<void> => {
    if (!accessToken.value) {
      return;
    }
    
    isLoading.value = true;
    error.value = null;
    
    try {
      // apiClient.get returns User directly due to interceptor
      const response = await apiClient.get('/users/me') as unknown as User;
      setUser(response);
    } catch (err: any) {
      // If fetching user fails, try to refresh token
      const refreshed = await refreshAccessToken();
      
      if (refreshed) {
        // If token refreshed successfully, try fetching user again
        try {
          const response = await apiClient.get('/users/me') as unknown as User;
          setUser(response);
        } catch (secondErr) {
          error.value = '获取用户信息失败';
          // Don't logout here, just show error
        }
      } else {
        error.value = err.response?.data?.detail || '获取用户信息失败';
        // Don't logout here, let the route guard handle it
      }
    } finally {
      isLoading.value = false;
    }
  };

  const hasPermission = (permission: string): boolean => {
    return userPermissions.value.includes(permission);
  };

  const hasRole = (role: string): boolean => {
    return userRole.value === role;
  };

  const canEditData = (): boolean => {
    return hasRole('admin') || hasRole('operator') || hasPermission('edit_data');
  };

  const canManageUsers = (): boolean => {
    return hasRole('admin') || hasPermission('manage_users');
  };

  return {
    // State
    accessToken,
    refreshToken,
    user,
    isLoading,
    error,
    
    // Computed
    isAuthenticated,
    userRole,
    userPermissions,
    
    // Actions
    login,
    logout,
    refreshAccessToken,
    fetchCurrentUser,
    hasPermission,
    hasRole,
    canEditData,
    canManageUsers
  };
});
