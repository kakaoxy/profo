"use client";

import { toast } from "sonner";
import { getFileUrl } from "@/lib/config";
import {
  getFileType,
  type Attachment,
  type AttachmentCategory,
} from "./attachment-types";
import type { UploadResponse } from "@/components/common/upload";

export interface UploadProgress {
  filename: string;
  progress: number;
}

/**
 * 解析上传响应中的文件 URL
 */
export function parseFileUrl(result: UploadResponse | Record<string, unknown>): string | null {
  // 处理 UploadResponse 类型
  if ("url" in result && typeof result.url === "string") {
    return getFileUrl(result.url);
  }

  // 处理 Record<string, unknown> 类型（向后兼容）
  const recordResult = result as Record<string, unknown>;
  const relativeUrl =
    (recordResult.data as Record<string, string>)?.url ||
    (recordResult.url as string) ||
    (recordResult.file_url as string) ||
    (recordResult.path as string);

  return getFileUrl(relativeUrl);
}

/**
 * 创建附件对象
 */
export function createAttachment(
  file: File,
  result: UploadResponse | Record<string, unknown>,
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
