"use client";

/**
 * 通用上传系统 - 工具函数
 */

import { toast } from "sonner";
import { apiPaths, getApiUrl, getFileUrl } from "@/lib/config";
import type { UploadResponse } from "./types";

/**
 * 尝试刷新 access token
 * 调用 Next.js API 路由 /api/auth/refresh
 */
export async function tryRefreshToken(): Promise<string | null> {
  try {
    const response = await fetch("/api/auth/refresh", {
      method: "POST",
      credentials: "include",
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return data.access_token || null;
  } catch {
    return null;
  }
}

/**
 * 获取有效的 access token
 * 优先从 localStorage 获取，不存在则尝试刷新
 */
export async function getValidToken(): Promise<string | null> {
  let token = localStorage.getItem("access_token") || localStorage.getItem("token");

  if (!token) {
    token = await tryRefreshToken();
  }

  return token;
}

/**
 * 检查 token 是否过期
 */
export function isTokenExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    const exp = payload.exp;
    const now = Math.floor(Date.now() / 1000);
    return exp < now;
  } catch {
    return true;
  }
}

/**
 * 获取带完整路径的上传 URL
 */
export function getUploadUrl(): string {
  return getApiUrl(apiPaths.files.upload);
}

/**
 * 格式化文件大小显示
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

/**
 * 检查文件类型是否被允许
 */
export function isAllowedFileType(
  file: File,
  allowedTypes: string[]
): boolean {
  if (allowedTypes.length === 0) return true;

  return allowedTypes.some((type) => {
    // 支持通配符，如 "image/*"
    if (type.endsWith("/*")) {
      const prefix = type.replace("/*", "");
      return file.type.startsWith(prefix);
    }
    return file.type === type;
  });
}

/**
 * 验证文件
 * 返回错误信息，验证通过返回 null
 */
export function validateFile(
  file: File,
  options: {
    maxSize?: number;
    allowedTypes?: string[];
  }
): string | null {
  const { maxSize = 10 * 1024 * 1024, allowedTypes = [] } = options;

  // 文件大小验证
  if (file.size > maxSize) {
    return `文件过大，最大支持 ${formatFileSize(maxSize)}`;
  }

  // 文件类型验证
  if (allowedTypes.length > 0 && !isAllowedFileType(file, allowedTypes)) {
    return "不支持的文件格式";
  }

  return null;
}

/**
 * 解析上传响应，提取 URL
 */
export function parseUploadResponse(response: Record<string, unknown>): UploadResponse | null {
  if (!response) return null;

  // 安全地获取 data 对象
  const data = response.data as Record<string, unknown> | undefined;

  // 尝试从不同格式的响应中提取 URL
  const url =
    data?.url ||
    response.url ||
    response.file_url ||
    response.path ||
    data?.file_url;

  if (!url || typeof url !== 'string') return null;

  // 确保 URL 是完整的
  const fullUrl = getFileUrl(url);

  return {
    url: fullUrl,
    filename: (response.filename as string | undefined) ?? (data?.filename as string | undefined),
    size: (response.size as number | undefined) ?? (data?.size as number | undefined),
    mimeType: (response.mime_type as string | undefined) ?? (data?.mime_type as string | undefined),
    raw: response,
  };
}

/**
 * 处理上传错误
 */
export function handleUploadError(
  xhr: XMLHttpRequest,
  filename: string
): void {
  if (xhr.status === 401) {
    toast.error(`${filename}: 上传失败`, {
      description: "登录已过期，请刷新页面后重试",
    });
    return;
  }

  try {
    const error = JSON.parse(xhr.responseText);
    toast.error(`${filename}: 上传失败`, {
      description: error.detail || `状态码: ${xhr.status}`,
    });
  } catch {
    toast.error(`${filename}: 上传失败`);
  }
}

/**
 * 生成唯一ID
 */
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}
