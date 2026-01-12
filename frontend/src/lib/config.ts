/**
 * API 配置 - 集中管理 API 基础 URL
 * 
 * 使用方式：
 * import { API_BASE_URL, getApiUrl } from '@/lib/config';
 */

/**
 * API 基础 URL
 * - 生产环境默认: https://fangmengchina.com
 * - 开发环境: 通过 .env.local 设置 NEXT_PUBLIC_API_URL=http://127.0.0.1:8000
 */
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "https://fangmengchina.com";

/**
 * 构建完整的 API URL
 * @param path - API 路径，例如 "/api/v1/auth/login"
 * @returns 完整的 API URL
 */
export function getApiUrl(path: string): string {
  // 确保 path 以 / 开头
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
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
