/**
 * API 配置 - 集中管理 API 基础 URL
 *
 * 使用方式：
 * import { apiPaths, getApiUrl } from '@/lib/config';
 *
 * 同服务器部署架构（Nginx 统一代理）：
 * - 浏览器端请求使用相对路径，Nginx 代理 /api/* → 后端 8000
 * - 服务端请求使用内网 http://127.0.0.1:8000，免 SSL/Nginx 开销
 * - 静态文件在生产和开发环境均正确处理
 */

/**
 * 浏览器可访问的后端地址（仅开发环境需要，跨端口访问）
 * 生产环境通过 Nginx 代理，不需要此变量
 */
const PUBLIC_API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

/**
 * 服务端内部 API 地址
 * 生产环境直连后端内网端口，无需经过 Nginx/SSL
 */
const SERVER_API_BASE =
  process.env.SERVER_API_URL ||
  (process.env.NODE_ENV === "production" ? "http://127.0.0.1:8000" : PUBLIC_API_BASE);

export const isProduction = process.env.NODE_ENV === "production";

/**
 * 预定义的 API 端点路径
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
  cAuth: {
    register: "/api/v1/public/auth/register",
    login: "/api/v1/public/auth/token",
    logout: "/api/v1/public/auth/logout",
    refresh: "/api/v1/public/auth/refresh",
    me: "/api/v1/public/auth/me",
  },
  cCommunities: {
    search: "/api/v1/public/communities/search",
  },
  cLeads: {
    create: "/api/v1/public/leads",
    mine: "/api/v1/public/leads/mine",
    detail: "/api/v1/public/leads",
  },
  cProjects: {
    list: "/api/v1/public/projects",
    sold: "/api/v1/public/projects/sold",
    detail: "/api/v1/public/projects",
    consultant: "/api/v1/public/projects",
  },
  cStats: {
    platform: "/api/v1/public/stats/platform",
  },
  cUsers: {
    profile: "/api/v1/public/users/profile",
    phone: "/api/v1/public/users/phone",
  },
} as const;

/**
 * 构建服务端 API URL（Server Components / Server Actions / Middleware 使用）
 * 生产环境直连内网 http://127.0.0.1:8000，可设 SERVER_API_URL 覆盖
 */
export function getApiUrl(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${SERVER_API_BASE}${normalizedPath}`;
}

/**
 * 构建客户端 API URL（Client Components 使用）
 * 始终返回相对路径：开发环境通过 Next.js rewrites 代理，生产环境通过 Nginx 代理
 */
export function getClientApiUrl(path: string): string {
  return path.startsWith("/") ? path : `/${path}`;
}

/**
 * 获取图片/文件的完整 URL
 * - 绝对 URL 指向后端 → 转为相对路径，通过 Next.js rewrites / Nginx 代理访问
 * - 绝对 URL 指向外部域名 → 直接返回
 * - blob:/data: URL → 直接返回
 * - 相对路径 → 生产环境直接返回相对路径（Nginx 代理 /static/），
 *   开发环境拼接后端地址
 */
export function getFileUrl(url: string | undefined | null): string {
  if (!url) return "";

  if (url.startsWith("blob:") || url.startsWith("data:")) {
    return url;
  }

  if (url.startsWith("http://") || url.startsWith("https://")) {
    try {
      const parsed = new URL(url);
      const backendHosts = [
        "127.0.0.1:8000",
        "localhost:8000",
        "fangmengchina.com",
      ];
      if (backendHosts.includes(parsed.host)) {
        return parsed.pathname;
      }
    } catch {
      // invalid URL, return as-is
    }
    return url;
  }

  const cleanPath = url.startsWith("/") ? url : `/${url}`;

  if (isProduction) {
    // Nginx 代理 /static/* 到后端，相对路径即可
    return cleanPath;
  }

  return `${PUBLIC_API_BASE}${cleanPath}`;
}
