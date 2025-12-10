# Next.js 前端开发指南

## 概述

本文档为计划使用 Next.js 重构 Profo 房产数据中心前端提供详细的后端集成指南。基于现有 Vue 3 + TypeScript 前端实现和 FastAPI 后端架构，帮助开发者快速理解后端接口设计和数据流。

## 后端架构概览

### 技术栈
- **框架**: FastAPI (Python 3.10+)
- **数据库**: SQLite (轻量级，本地化)
- **ORM**: SQLAlchemy 2.0
- **认证**: JWT (访问令牌 + 刷新令牌)
- **API 文档**: 自动生成 Swagger UI (访问: `http://localhost:8000/docs`)

### 核心模块
```
backend/
├── routers/          # API 路由
│   ├── auth.py       # 认证接口
│   ├── users.py      # 用户管理
│   ├── push.py       # 房源推送
│   ├── properties.py # 房源查询
│   ├── upload.py     # CSV 上传
│   ├── admin.py      # 小区管理
│   ├── projects_simple.py  # 项目管理
│   └── cashflow_simple.py  # 现金流管理
├── schemas/          # 数据验证模型 (Pydantic)
├── models/           # 数据库模型
└── services/         # 业务逻辑服务
```

## API 接口详解

### 1. 认证与授权

#### JWT 认证机制
- **访问令牌**: 30 分钟过期
- **刷新令牌**: 7 天过期
- **令牌结构**: 
  ```typescript
  interface TokenResponse {
    access_token: string;
    refresh_token: string;
    token_type: "bearer";
    expires_in: number;  // 秒
    user: UserResponse;
  }
  ```

#### 登录流程
```typescript
// 1. 用户登录
POST /api/auth/login
Body: { username: string; password: string }

// 2. 保存令牌
localStorage.setItem('access_token', tokenResponse.access_token);
localStorage.setItem('refresh_token', tokenResponse.refresh_token);

// 3. 后续请求添加 Header
headers: {
  'Authorization': `Bearer ${access_token}`
}

// 4. 令牌刷新 (当 401 时)
POST /api/auth/refresh
Body: { refresh_token: string }
```

#### Next.js 认证实现示例
```typescript
// lib/auth.ts
import { jwtDecode } from 'jwt-decode';

export interface JWTPayload {
  sub: string;        // 用户ID
  role: string;       // 角色代码
  exp: number;        // 过期时间
}

export class AuthService {
  private static readonly ACCESS_TOKEN_KEY = 'access_token';
  private static readonly REFRESH_TOKEN_KEY = 'refresh_token';

  // 获取访问令牌
  static getAccessToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(this.ACCESS_TOKEN_KEY);
  }

  // 获取刷新令牌
  static getRefreshToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(this.REFRESH_TOKEN_KEY);
  }

  // 保存令牌
  static saveTokens(accessToken: string, refreshToken: string): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(this.ACCESS_TOKEN_KEY, accessToken);
    localStorage.setItem(this.REFRESH_TOKEN_KEY, refreshToken);
  }

  // 清除令牌
  static clearTokens(): void {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(this.ACCESS_TOKEN_KEY);
    localStorage.removeItem(this.REFRESH_TOKEN_KEY);
  }

  // 检查令牌是否过期
  static isTokenExpired(token: string): boolean {
    try {
      const decoded = jwtDecode<JWTPayload>(token);
      return decoded.exp * 1000 < Date.now();
    } catch {
      return true;
    }
  }

  // 获取认证头
  static getAuthHeader(): Record<string, string> {
    const token = this.getAccessToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }
}

// hooks/useAuth.ts
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AuthService } from '@/lib/auth';

export function useAuth(requireAuth: boolean = true) {
  const router = useRouter();

  useEffect(() => {
    const token = AuthService.getAccessToken();
    
    if (!token && requireAuth) {
      router.push('/login');
      return;
    }

    if (token && AuthService.isTokenExpired(token)) {
      // 尝试刷新令牌
      refreshToken();
    }
  }, [requireAuth, router]);

  const refreshToken = async () => {
    const refreshToken = AuthService.getRefreshToken();
    if (!refreshToken) {
      router.push('/login');
      return;
    }

    try {
      const response = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });

      if (response.ok) {
        const data = await response.json();
        AuthService.saveTokens(data.access_token, data.refresh_token);
      } else {
        AuthService.clearTokens();
        router.push('/login');
      }
    } catch {
      AuthService.clearTokens();
      router.push('/login');
    }
  };

  return {
    isAuthenticated: !!AuthService.getAccessToken(),
  };
}
```

### 2. 数据模型与 TypeScript 类型

#### 用户相关类型
```typescript
// types/user.ts
export interface Role {
  id: string;
  name: string;
  code: 'admin' | 'operator' | 'user';
  description: string;
  permissions: string[];
  is_active: boolean;
  created_at: string;
}

export interface User {
  id: string;
  username: string;
  nickname: string;
  phone: string | null;
  email: string | null;
  avatar: string | null;
  role: Role;
  status: 'active' | 'inactive';
  must_change_password: boolean;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserListResponse {
  total: number;
  items: User[];
}
```

#### 房源相关类型
```typescript
// types/property.ts
export type PropertyStatus = '在售' | '成交';

export interface Property {
  id: number;
  data_source: string;
  source_property_id: string;
  status: PropertyStatus;
  community_name: string;
  rooms: number;
  halls: number | null;
  baths: number | null;
  orientation: string;
  floor_display: string;
  floor_level: '低楼层' | '中楼层' | '高楼层' | null;
  build_area: number;
  inner_area: number | null;
  listed_price_wan: number | null;
  sold_price_wan: number | null;
  listed_date: string | null;
  sold_date: string | null;
  property_type: string | null;
  build_year: number | null;
  decoration: string | null;
  elevator: boolean | null;
  property_right: string | null;
  right年限: number | null;
  last_transaction: string | null;
  heating: string | null;
  description: string | null;
  city_id: number | null;
  district: string | null;
  business_circle: string | null;
  picture_links: string[];
  unit_price: number;  // 自动计算
  total_price: number;  // 自动计算
  transaction_duration_days: number | null;
  created_at: string;
  updated_at: string;
}

export interface PaginatedPropertyResponse {
  total: number;
  page: number;
  page_size: number;
  items: Property[];
}
```

#### 项目相关类型
```typescript
// types/project.ts
export type ProjectStatus = 'signing' | 'renovating' | 'selling' | 'sold';

export type RenovationStage = 
  | '拆除' | '设计' | '水电' | '木瓦' | '油漆' | '安装' | '交付';

export interface Project {
  id: string;
  name: string;
  community_name: string;
  address: string;
  owner_name: string;
  owner_phone: string;
  notes: string | null;
  status: ProjectStatus;
  signing_date: string | null;
  renovation_start_date: string | null;
  renovation_end_date: string | null;
  listing_date: string | null;
  sold_date: string | null;
  renovation_stage: RenovationStage | null;
  property_agent: string | null;
  client_agent: string | null;
  first_viewer: string | null;
  created_at: string;
  updated_at: string;
}

export interface CashFlowRecord {
  id: string;
  type: 'income' | 'expense';
  category: string;
  amount: number;
  date: string;
  description: string | null;
  related_stage: string | null;
  created_at: string;
}

export interface CashFlowSummary {
  total_income: number;
  total_expense: number;
  net_cash_flow: number;
  roi: number;
}

export interface ProjectReport {
  project_id: string;
  project_name: string;
  status: ProjectStatus;
  signing_date: string | null;
  renovation_start_date: string | null;
  renovation_end_date: string | null;
  listing_date: string | null;
  sold_date: string | null;
  total_investment: number;
  total_income: number;
  net_profit: number;
  roi: number;
  address: string;
  sale_price: number | null;
  list_price: number | null;
}
```

### 3. API 客户端封装

#### 基础请求封装
```typescript
// lib/api-client.ts
import { AuthService } from './auth';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: string,
    public details?: any
  ) {
    super(message);
  }
}

export class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000') {
    this.baseUrl = baseUrl;
  }

  // GET 请求
  async get<T>(endpoint: string, params?: Record<string, any>): Promise<T> {
    const url = new URL(`${this.baseUrl}${endpoint}`);
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          url.searchParams.append(key, String(value));
        }
      });
    }

    const response = await fetch(url.toString(), {
      headers: {
        ...AuthService.getAuthHeader(),
        'Content-Type': 'application/json',
      },
    });

    return this.handleResponse<T>(response);
  }

  // POST 请求
  async post<T>(endpoint: string, data?: any): Promise<T> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        ...AuthService.getAuthHeader(),
        'Content-Type': 'application/json',
      },
      body: data ? JSON.stringify(data) : undefined,
    });

    return this.handleResponse<T>(response);
  }

  // PUT 请求
  async put<T>(endpoint: string, data?: any): Promise<T> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'PUT',
      headers: {
        ...AuthService.getAuthHeader(),
        'Content-Type': 'application/json',
      },
      body: data ? JSON.stringify(data) : undefined,
    });

    return this.handleResponse<T>(response);
  }

  // DELETE 请求
  async delete<T>(endpoint: string): Promise<T> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'DELETE',
      headers: {
        ...AuthService.getAuthHeader(),
        'Content-Type': 'application/json',
      },
    });

    return this.handleResponse<T>(response);
  }

  // 文件上传
  async upload<T>(endpoint: string, file: File): Promise<T> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        ...AuthService.getAuthHeader(),
      },
      body: formData,
    });

    return this.handleResponse<T>(response);
  }

  private async handleResponse<T>(response: Response): Promise<T> {
    const data = await response.json();

    if (!response.ok) {
      throw new ApiError(
        data.error?.message || '请求失败',
        response.status,
        data.error?.code || 'UNKNOWN_ERROR',
        data.error?.details
      );
    }

    return data;
  }
}

// 单例实例
export const apiClient = new ApiClient();
```

#### 具体 API 模块
```typescript
// api/auth.ts
import { apiClient } from '@/lib/api-client';
import { User, TokenResponse } from '@/types/user';

export const authApi = {
  // 登录
  login: (username: string, password: string) =>
    apiClient.post<TokenResponse>('/api/auth/login', { username, password }),

  // 刷新令牌
  refreshToken: (refreshToken: string) =>
    apiClient.post<TokenResponse>('/api/auth/refresh', { refresh_token: refreshToken }),

  // 获取当前用户信息
  getMe: () => apiClient.get<{ user: User }>('/api/auth/me'),

  // 微信登录
  wechatLogin: (code: string) =>
    apiClient.post<TokenResponse>('/api/auth/wechat/login', { code }),
};

// api/properties.ts
import { apiClient } from '@/lib/api-client';
import { Property, PaginatedPropertyResponse } from '@/types/property';

export interface PropertyQueryParams {
  status?: '在售' | '成交';
  community_name?: string;
  districts?: string[];
  business_circles?: string[];
  orientations?: string[];
  floor_levels?: string[];
  min_price?: number;
  max_price?: number;
  min_area?: number;
  max_area?: number;
  rooms?: number[];
  rooms_gte?: number;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
  page?: number;
  page_size?: number;
}

export const propertiesApi = {
  // 查询房源列表
  getProperties: (params: PropertyQueryParams) =>
    apiClient.get<PaginatedPropertyResponse>('/api/properties', params),

  // 获取房源详情
  getPropertyDetail: (id: number) =>
    apiClient.get<{ data: Property }>(`/api/properties/${id}`),

  // 导出房源
  exportProperties: (params: PropertyQueryParams) =>
    apiClient.get('/api/properties/export', params),

  // 推送房源数据
  pushProperties: (properties: any[]) =>
    apiClient.post<{ total: number; success: number; failed: number; errors: any[] }>(
      '/api/push',
      properties
    ),
};

// api/projects.ts
import { apiClient } from '@/lib/api-client';
import { Project, CashFlowRecord, CashFlowSummary, ProjectReport } from '@/types/project';

export const projectsApi = {
  // 获取项目统计
  getStats: () => apiClient.get<{ data: Record<string, number> }>('/api/v1/projects/stats'),

  // 获取项目列表
  getProjects: (params?: {
    status?: string;
    community_name?: string;
    page?: number;
    page_size?: number;
  }) => apiClient.get('/api/v1/projects', params),

  // 创建项目
  createProject: (data: any) => apiClient.post('/api/v1/projects', data),

  // 获取项目详情
  getProject: (id: string) => apiClient.get(`/api/v1/projects/${id}`),

  // 更新项目状态
  updateStatus: (id: string, status: string) =>
    apiClient.put(`/api/v1/projects/${id}/status`, { status }),

  // 完成项目
  completeProject: (id: string, data: { sold_price: number; sold_date: string }) =>
    apiClient.post(`/api/v1/projects/${id}/complete`, data),

  // 现金流管理
  getCashFlow: (id: string) =>
    apiClient.get<{ records: CashFlowRecord[]; summary: CashFlowSummary }>(
      `/api/v1/projects/${id}/cashflow`
    ),

  createCashFlow: (id: string, data: any) =>
    apiClient.post(`/api/v1/projects/${id}/cashflow`, data),

  deleteCashFlow: (projectId: string, recordId: string) =>
    apiClient.delete(`/api/v1/projects/${projectId}/cashflow/${recordId}`),

  // 获取项目报告
  getReport: (id: string) => apiClient.get<{ data: ProjectReport }>(`/api/v1/projects/${id}/report`),
};
```

### 4. React Query 集成

#### 配置 React Query
```typescript
// lib/react-query.ts
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5分钟
      retry: 1,
    },
  },
});
```

#### 自定义 Hooks
```typescript
// hooks/useProperties.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { propertiesApi, PropertyQueryParams } from '@/api/properties';
import { Property } from '@/types/property';

export function useProperties(params: PropertyQueryParams) {
  return useQuery({
    queryKey: ['properties', params],
    queryFn: () => propertiesApi.getProperties(params),
  });
}

export function usePropertyDetail(id: number) {
  return useQuery({
    queryKey: ['property', id],
    queryFn: () => propertiesApi.getPropertyDetail(id),
    enabled: !!id,
  });
}

export function usePushProperties() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (properties: any[]) => propertiesApi.pushProperties(properties),
    onSuccess: () => {
      // 推送成功后刷新房源列表
      queryClient.invalidateQueries({ queryKey: ['properties'] });
    },
  });
}

// hooks/useProjects.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { projectsApi } from '@/api/projects';

export function useProjectStats() {
  return useQuery({
    queryKey: ['project-stats'],
    queryFn: () => projectsApi.getStats(),
  });
}

export function useProjects(params?: any) {
  return useQuery({
    queryKey: ['projects', params],
    queryFn: () => projectsApi.getProjects(params),
  });
}

export function useProject(id: string) {
  return useQuery({
    queryKey: ['project', id],
    queryFn: () => projectsApi.getProject(id),
    enabled: !!id,
  });
}

export function useCreateProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: any) => projectsApi.createProject(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['project-stats'] });
    },
  });
}

export function useCashFlow(id: string) {
  return useQuery({
    queryKey: ['cashflow', id],
    queryFn: () => projectsApi.getCashFlow(id),
    enabled: !!id,
  });
}
```

## 页面开发示例

### 1. 登录页面
```typescript
// app/login/page.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { authApi } from '@/api/auth';
import { AuthService } from '@/lib/auth';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const loginMutation = useMutation({
    mutationFn: () => authApi.login(username, password),
    onSuccess: (data) => {
      AuthService.saveTokens(data.access_token, data.refresh_token);
      router.push('/dashboard');
    },
    onError: (error: any) => {
      setError(error.message || '登录失败');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loginMutation.mutate();
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8">
        <h1 className="text-2xl font-bold mb-6 text-center">登录</h1>
        
        {error && (
          <div className="bg-red-50 text-red-700 p-3 rounded mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">用户名</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium mb-2">密码</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loginMutation.isPending}
            className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
          >
            {loginMutation.isPending ? '登录中...' : '登录'}
          </button>
        </form>
      </div>
    </div>
  );
}
```

### 2. 房源列表页面
```typescript
// app/properties/page.tsx
'use client';

import { useState } from 'react';
import { useProperties } from '@/hooks/useProperties';
import { PropertyStatus } from '@/types/property';

export default function PropertiesPage() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<PropertyStatus | undefined>();
  const [communityName, setCommunityName] = useState('');

  const { data, isLoading, error } = useProperties({
    page,
    page_size: 50,
    status,
    community_name: communityName || undefined,
    sort_by: 'updated_at',
    sort_order: 'desc',
  });

  if (isLoading) return <div>加载中...</div>;
  if (error) return <div>加载失败: {error.message}</div>;

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">房源列表</h1>
      
      {/* 筛选面板 */}
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="grid grid-cols-4 gap-4">
          <select
            value={status || ''}
            onChange={(e) => setStatus(e.target.value as PropertyStatus || undefined)}
            className="px-3 py-2 border rounded-lg"
          >
            <option value="">全部状态</option>
            <option value="在售">在售</option>
            <option value="成交">成交</option>
          </select>

          <input
            type="text"
            placeholder="小区名称"
            value={communityName}
            onChange={(e) => setCommunityName(e.target.value)}
            className="px-3 py-2 border rounded-lg"
          />
        </div>
      </div>

      {/* 房源列表 */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">房源ID</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">小区</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">户型</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">面积</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">价格</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">状态</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {data?.items.map((property) => (
              <tr key={property.id} className="hover:bg-gray-50">
                <td className="px-6 py-4">{property.source_property_id}</td>
                <td className="px-6 py-4">{property.community_name}</td>
                <td className="px-6 py-4">{property.rooms}室{property.halls}厅</td>
                <td className="px-6 py-4">{property.build_area}㎡</td>
                <td className="px-6 py-4">{property.total_price}万</td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-1 text-xs rounded-full ${
                    property.status === '在售' 
                      ? 'bg-green-100 text-green-800' 
                      : 'bg-blue-100 text-blue-800'
                  }`}>
                    {property.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 分页 */}
      <div className="mt-6 flex justify-between items-center">
        <div className="text-sm text-gray-700">
          共 {data?.total || 0} 条记录
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setPage(page - 1)}
            disabled={page <= 1}
            className="px-4 py-2 border rounded-lg disabled:opacity-50"
          >
            上一页
          </button>
          <button
            onClick={() => setPage(page + 1)}
            disabled={!data || data.items.length < 50}
            className="px-4 py-2 border rounded-lg disabled:opacity-50"
          >
            下一页
          </button>
        </div>
      </div>
    </div>
  );
}
```

### 3. 项目管理页面
```typescript
// app/projects/[id]/page.tsx
'use client';

import { useParams } from 'next/navigation';
import { useProject, useCashFlow } from '@/hooks/useProjects';
import { formatCurrency } from '@/lib/utils';

export default function ProjectDetailPage() {
  const params = useParams();
  const projectId = params.id as string;

  const { data: project, isLoading: projectLoading } = useProject(projectId);
  const { data: cashFlow, isLoading: cashFlowLoading } = useCashFlow(projectId);

  if (projectLoading) return <div>加载项目信息...</div>;

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">{project?.data.name}</h1>
      
      <div className="grid grid-cols-3 gap-6 mb-8">
        {/* 项目信息卡片 */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">项目信息</h2>
          <div className="space-y-2">
            <p><span className="font-medium">状态:</span> {project?.data.status}</p>
            <p><span className="font-medium">地址:</span> {project?.data.address}</p>
            <p><span className="font-medium">业主:</span> {project?.data.owner_name}</p>
          </div>
        </div>

        {/* 财务概览 */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">财务概览</h2>
          {cashFlowLoading ? (
            <div>加载中...</div>
          ) : (
            <div className="space-y-2">
              <p><span className="font-medium">总收入:</span> {formatCurrency(cashFlow?.summary.total_income || 0)}</p>
              <p><span className="font-medium">总支出:</span> {formatCurrency(cashFlow?.summary.total_expense || 0)}</p>
              <p><span className="font-medium">净利润:</span> {formatCurrency(cashFlow?.summary.net_cash_flow || 0)}</p>
              <p><span className="font-medium">ROI:</span> {cashFlow?.summary.roi?.toFixed(2)}%</p>
            </div>
          )}
        </div>

        {/* 时间线 */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">关键节点</h2>
          <div className="space-y-2">
            <p><span className="font-medium">签约:</span> {project?.data.signing_date?.split('T')[0]}</p>
            <p><span className="font-medium">改造开始:</span> {project?.data.renovation_start_date?.split('T')[0]}</p>
            <p><span className="font-medium">改造结束:</span> {project?.data.renovation_end_date?.split('T')[0]}</p>
            <p><span className="font-medium">售出:</span> {project?.data.sold_date?.split('T')[0]}</p>
          </div>
        </div>
      </div>

      {/* 现金流记录 */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold mb-4">现金流记录</h2>
        <table className="min-w-full">
          <thead>
            <tr className="border-b">
              <th className="text-left py-2">日期</th>
              <th className="text-left py-2">类型</th>
              <th className="text-left py-2">分类</th>
              <th className="text-right py-2">金额</th>
              <th className="text-left py-2">描述</th>
            </tr>
          </thead>
          <tbody>
            {cashFlow?.records.map((record) => (
              <tr key={record.id} className="border-b">
                <td className="py-2">{record.date.split('T')[0]}</td>
                <td className="py-2">
                  <span className={`px-2 py-1 text-xs rounded ${
                    record.type === 'income' 
                      ? 'bg-green-100 text-green-800' 
                      : 'bg-red-100 text-red-800'
                  }`}>
                    {record.type === 'income' ? '收入' : '支出'}
                  </span>
                </td>
                <td className="py-2">{record.category}</td>
                <td className="py-2 text-right">{formatCurrency(record.amount)}</td>
                <td className="py-2">{record.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

## 开发环境配置

### 环境变量
```env
# .env.local
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_APP_NAME=Profo房产数据中心
```

### Next.js 配置
```typescript
// next.config.js
/** @type {import('next').NextConfig} */
const nextConfig = {
  // API 代理配置（开发环境）
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:8000/api/:path*',
      },
    ];
  },
  
  // 图片域名配置
  images: {
    domains: ['localhost', 'your-cdn-domain.com'],
  },
};

module.exports = nextConfig;
```

### Tailwind CSS 配置
```typescript
// tailwind.config.ts
import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#eff6ff',
          100: '#dbeafe',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
        },
      },
    },
  },
  plugins: [],
};

export default config;
```

## 最佳实践

### 1. 错误处理
```typescript
// components/ErrorBoundary.tsx
'use client';

import { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="p-4 bg-red-50 border border-red-200 rounded">
          <h2 className="text-lg font-semibold text-red-800 mb-2">出错了</h2>
          <p className="text-red-600">{this.state.error?.message}</p>
        </div>
      );
    }

    return this.props.children;
  }
}
```

### 2. 加载状态管理
```typescript
// components/LoadingSpinner.tsx
export function LoadingSpinner({ size = 'medium' }: { size?: 'small' | 'medium' | 'large' }) {
  const sizeClasses = {
    small: 'w-4 h-4',
    medium: 'w-8 h-8',
    large: 'w-12 h-12',
  };

  return (
    <div className="flex justify-center items-center">
      <div className={`${sizeClasses[size]} animate-spin rounded-full border-4 border-gray-200 border-t-blue-600`}></div>
    </div>
  );
}

// hooks/useLoading.ts
import { useState } from 'react';

export function useLoading() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const withLoading = async <T>(promise: Promise<T>): Promise<T> => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await promise;
      return result;
    } catch (err) {
      setError(err instanceof Error ? err.message : '未知错误');
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  return { isLoading, error, withLoading, setError };
}
```

### 3. 表单处理
```typescript
// hooks/useForm.ts
import { useState } from 'react';

export function useForm<T extends Record<string, any>>(initialValues: T) {
  const [values, setValues] = useState<T>(initialValues);
  const [errors, setErrors] = useState<Partial<Record<keyof T, string>>>({});

  const handleChange = (field: keyof T) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const value = e.target.type === 'checkbox' 
      ? (e.target as HTMLInputElement).checked 
      : e.target.value;
    
    setValues((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (onSubmit: (values: T) => Promise<void>) => async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    try {
      await onSubmit(values);
    } catch (error: any) {
      if (error.details) {
        setErrors(error.details);
      }
    }
  };

  const setFieldValue = (field: keyof T, value: any) => {
    setValues((prev) => ({ ...prev, [field]: value }));
  };

  return {
    values,
    errors,
    handleChange,
    handleSubmit,
    setFieldValue,
    setValues,
  };
}
```

## 注意事项

### 1. CORS 配置
后端已配置 CORS 允许 `http://localhost:3000`，Next.js 开发服务器默认运行在 3000 端口。

### 2. 图片处理
- 房源图片存储在 `property_media` 表
- 图片 URL 可能是相对路径（如 `/static/uploads/xxx.jpg`）
- 需要拼接完整 URL: `${API_URL}${imageUrl}`

### 3. 权限控制
```typescript
// hooks/usePermission.ts
import { useAuth } from '@/hooks/useAuth';
import { User } from '@/types/user';

export function usePermission() {
  const { user } = useAuth();

  const hasPermission = (permission: string): boolean => {
    return user?.role.permissions.includes(permission) || false;
  };

  const isAdmin = user?.role.code === 'admin';
  const isOperator = user?.role.code === 'operator';
  const isUser = user?.role.code === 'user';

  return {
    hasPermission,
    isAdmin,
    isOperator,
    isUser,
  };
}
```

### 4. 性能优化
- 使用 React Query 的缓存机制
- 实现虚拟滚动处理大量房源数据
- 图片懒加载
- 路由懒加载

### 5. 类型安全
- 所有 API 响应都应有对应的 TypeScript 类型
- 使用 Zod 进行运行时类型验证（可选但推荐）
- 保持前后端类型同步

## 迁移检查清单

从 Vue 3 迁移到 Next.js 需要注意：

- [ ] 将 Pinia stores 迁移到 React Context + useReducer 或 Zustand
- [ ] 将 Vue Router 路由迁移到 Next.js App Router
- [ ] 将 Vue 组件迁移到 React 组件
- [ ] 将 Vue 组合式函数迁移到 React Hooks
- [ ] 更新 API 客户端从 Axios 到 Fetch API
- [ ] 实现新的认证流程
- [ ] 配置 Tailwind CSS
- [ ] 设置 React Query
- [ ] 测试所有页面功能
- [ ] 性能优化

## 常见问题

### Q: 如何处理 JWT 令牌刷新？
A: 使用 Axios 拦截器或 Fetch 封装统一处理 401 响应，自动刷新令牌并重试请求。

### Q: 如何保持登录状态？
A: 使用 localStorage 存储令牌，在应用初始化时检查令牌有效性。

### Q: 如何处理文件上传？
A: 使用 FormData 和 Fetch API，注意设置正确的 Content-Type。

### Q: 如何管理全局状态？
A: 推荐使用 React Query 管理服务器状态，React Context 管理客户端状态。

### Q: 如何优化大量数据展示？
A: 使用虚拟滚动库（如 react-window 或 @tanstack/react-virtual）。

## 相关文档
- [API 接口文档](./API_PUSH.md)
- [项目 README](./README.md)
- [FastAPI 文档](http://localhost:8000/docs) (运行后端后访问)