// 用户角色类型
export interface Role {
  code: string;
  name: string;
  permissions: string[];
}

// 用户信息类型
export interface User {
  id: string;
  username: string;
  nickname: string;
  role: Role;
}

// 登录请求类型
export interface LoginRequest {
  username: string;
  password: string;
}

// 登录响应类型
export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  user: User;
}

// API响应基础类型
export interface ApiResponse<T = any> {
  code: number;
  msg: string;
  data?: T;
  success?: boolean;
  error?: {
    code: string;
    message: string;
    details?: string;
  };
}

// 认证状态类型
export interface AuthState {
  isAuthenticated: boolean;
  user: User | null;
  accessToken: string | null;
  loading: boolean;
}

// 统计项类型
export interface StatItem {
  label: string;
  value: string;
  trend?: {
    value: string;
    isUp: boolean;
  };
  highlight?: boolean;
}

// 线索信息类型
export interface Lead {
  id: string;
  community: string;
  layout: string;
  orientation: string;
  floor: string;
  area: string;
  totalPrice: string;
  unitPrice: string;
  time: string;
  floorPlanUrl: string;
}

// 任务摘要类型
export interface TaskSummary {
  title: string;
  pending: number;
  processed: number;
  iconBg: string;
  icon: React.ReactNode;
}