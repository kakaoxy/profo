/**
 * API 配置 - 集中管理 API 基础 URL
 * 
 * 使用方式：
 * import { apiPaths, getApiUrl, apiRequest } from '@/lib/config';
 * 
 * Next.js 最佳实践：
 * 1. 不要直接使用 API_BASE_URL 拼接 URL
 * 2. 使用 apiPaths 获取预定义的端点
 * 3. 使用 getApiUrl(path) 构建完整 URL
 * 4. Server Actions 中使用 apiRequest() 进行 API 调用
 */

/**
 * API 基础 URL (内部使用)
 * - 生产环境默认: https://fangmengchina.com
 * - 开发环境: 通过 .env.local 设置 NEXT_PUBLIC_API_URL=http://127.0.0.1:8000
 */
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "https://fangmengchina.com";

/**
 * 服务器端直接访问后端的 URL（不经过 Nginx）
 * 用于 Server Actions 直接连接本地后端，避免服务器访问自身公网域名的问题
 */
const SERVER_SIDE_API_URL = process.env.SERVER_SIDE_API_URL || "http://127.0.0.1:8000";

/**
 * 预定义的 API 端点路径
 * 使用这些常量而不是手动拼接 URL
 */
export const apiPaths = {
  auth: {
    token: "/api/v1/auth/token",
    refresh: "/api/v1/auth/refresh",
  },
  users: {
    changePassword: "/api/v1/users/change-password",
  },
  files: {
    upload: "/api/v1/files/upload",
  },
  communities: {
    base: "/api/v1/admin/communities",
  },
  properties: {
    export: "/api/v1/properties/export",
  },
} as const;

/**
 * 构建完整的 API URL（用于 Server Actions）
 * @param path - API 路径，例如 "/api/v1/auth/login"
 * @returns 完整的 API URL
 * 
 * 注意：Server Actions 中的 fetch 需要完整的绝对 URL
 * 
 * [修复] 服务器端直接访问本地后端 (127.0.0.1:8000)，避免服务器访问自身公网域名失败的问题
 * 客户端仍使用公网域名，通过 Nginx 代理到后端
 */
export function getApiUrl(path: string): string {
  // 确保 path 以 / 开头
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  
  // 服务器端（Server Actions）：直接访问本地后端，不经过 Nginx
  if (typeof window === "undefined") {
    return `${SERVER_SIDE_API_URL}${normalizedPath}`;
  }
  
  // 客户端：使用公网域名，通过 Nginx 代理
  return `${API_BASE_URL}${normalizedPath}`;
}

/**
 * 构建 API URL（用于客户端组件）
 * @param path - API 路径，例如 "/api/v1/upload/csv"
 * @returns 开发环境下返回相对路径（通过 Next.js rewrite 代理），生产环境返回完整 URL
 * 
 * [修复] 开发环境使用相对路径配合 Next.js rewrite 规则代理到后端
 * 这样可以解决跨域 Cookie 问题，确保 httpOnly Cookie 能正确发送
 * 
 * [修复2] 服务器端渲染时直接访问本地后端，避免 SSL 证书问题
 */
export function getClientApiUrl(path: string): string {
  // 确保 path 以 / 开头
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  // 服务器端（SSR/Server Action）：直接访问本地后端
  if (typeof window === "undefined") {
    return `${SERVER_SIDE_API_URL}${normalizedPath}`;
  }

  // 开发环境：使用相对路径，通过 Next.js rewrite 代理到后端
  if (!isProduction) {
    return normalizedPath;
  }

  // 客户端生产环境：使用公网域名
  return `${API_BASE_URL}${normalizedPath}`;
}

/**
 * 检查是否为生产环境
 */
export const isProduction = process.env.NODE_ENV === "production";



/**
 * 检查是否配置了生产 API URL
 * 用于上线前检查
 */
export function validateApiConfig(): { valid: boolean; message: string } {
  const envUrl = process.env.NEXT_PUBLIC_API_URL;
  
  if (!envUrl) {
    return {
      valid: false,
      message: "警告: NEXT_PUBLIC_API_URL 未配置，使用默认开发地址",
    };
  }
  
  if (envUrl.includes("localhost") || envUrl.includes("127.0.0.1")) {
    return {
      valid: false,
      message: "警告: NEXT_PUBLIC_API_URL 指向本地地址，请确认是否用于生产环境",
    };
  }
  
  return { valid: true, message: "API URL 配置正确" };
}
/**
 * 获取图片/文件的完整 URL
 * 如果是相对路径，会自动拼接后端基础地址
 * 
 * @param url - 图片/文件的原始路径
 * @returns 完整的 URL
 */
export function getFileUrl(url: string | undefined | null): string {
  if (!url) return "";

  // 1. 如果已经是完整的 URL (http/https) 或者是本地预览的 Blob URL，直接返回
  if (
    url.startsWith("blob:") ||
    url.startsWith("http") ||
    url.startsWith("https")
  ) {
    return url;
  }

  // 2. 如果是相对路径，拼接后端的 Base URL
  // API_BASE_URL 通常是 http://127.0.0.1:8000
  const serverRoot = API_BASE_URL.replace(/\/api\/v1\/?$/, "");

  // 确保 url 以 / 开头
  const cleanPath = url.startsWith("/") ? url : `/${url}`;

  return `${serverRoot}${cleanPath}`;
}
