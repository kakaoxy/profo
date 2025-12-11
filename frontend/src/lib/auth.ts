import { LoginRequest, LoginResponse, User } from '@/types';

const TOKEN_KEY = 'access_token';
const REFRESH_TOKEN_KEY = 'refresh_token';
const USER_KEY = 'user';

/**
 * 保存认证信息到localStorage
 */
export function saveAuthData(response: LoginResponse): void {
  if (typeof window === 'undefined') return;
  
  localStorage.setItem(TOKEN_KEY, response.access_token);
  localStorage.setItem(REFRESH_TOKEN_KEY, response.refresh_token);
  localStorage.setItem(USER_KEY, JSON.stringify(response.user));
}

/**
 * 从localStorage获取access token
 */
export function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

/**
 * 从localStorage获取用户信息
 */
export function getUser(): User | null {
  if (typeof window === 'undefined') return null;
  
  const userStr = localStorage.getItem(USER_KEY);
  if (!userStr) return null;
  
  try {
    return JSON.parse(userStr);
  } catch {
    return null;
  }
}

/**
 * 清除认证信息
 */
export function clearAuthData(): void {
  if (typeof window === 'undefined') return;
  
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

/**
 * 检查用户是否已认证
 */
export function isAuthenticated(): boolean {
  return !!getAccessToken();
}

/**
 * 登录
 */
export async function login(credentials: LoginRequest): Promise<LoginResponse> {
  const response = await fetch('http://localhost:8000/api/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(credentials),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error?.message || '登录失败');
  }

  const data: LoginResponse = await response.json();
  saveAuthData(data);
  return data;
}

/**
 * 登出
 */
export function logout(): void {
  clearAuthData();
}