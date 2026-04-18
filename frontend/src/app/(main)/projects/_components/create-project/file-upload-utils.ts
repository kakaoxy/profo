"use client";

import { toast } from "sonner";
import { API_BASE_URL } from "@/lib/config";
import {
  getFileType,
  type Attachment,
  type AttachmentCategory,
} from "./attachment-types";

export interface UploadProgress {
  filename: string;
  progress: number;
}

/**
 * 尝试刷新 token
 * 注意：调用 Next.js API 路由 /api/auth/refresh，它会从 httpOnly cookie 中读取 refresh_token
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
 * 获取有效的 access token
 */
export async function getValidToken(): Promise<string | null> {
  const token = localStorage.getItem("access_token") || localStorage.getItem("token");

  const tokenExpired = token ? isTokenExpired(token) : true;
  if (!token || tokenExpired) {
    const newToken = await tryRefreshToken();
    if (!newToken) {
      toast.error("登录已过期，请重新登录");
      return null;
    }
    return newToken;
  }

  return token;
}

/**
 * 解析上传响应中的文件 URL
 */
export function parseFileUrl(result: Record<string, unknown>): string | null {
  const relativeUrl =
    (result.data as Record<string, string>)?.url ||
    (result.url as string) ||
    (result.file_url as string) ||
    (result.path as string);

  if (relativeUrl?.startsWith("/")) {
    return `${API_BASE_URL}${relativeUrl}`;
  }
  return relativeUrl || null;
}

/**
 * 创建附件对象
 */
export function createAttachment(
  file: File,
  result: Record<string, unknown>,
  category: AttachmentCategory
): Attachment | null {
  const fileType = getFileType(file.name);
  if (!fileType) {
    return null;
  }

  const url = parseFileUrl(result);
  if (!url) {
    return null;
  }

  return {
    id: crypto.randomUUID(),
    filename: file.name,
    url,
    category,
    fileType,
    size: file.size,
    uploadedAt: new Date().toISOString(),
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
