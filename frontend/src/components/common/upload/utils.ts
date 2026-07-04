"use client";

/**
 * 通用上传系统 - 工具函数
 */

import { toast } from "sonner";
import { apiPaths, getClientApiUrl, getFileUrl } from "@/lib/config";
import { formatFileSize } from "@/lib/formatters";
import type { UploadResponse } from "./types";

/**
 * 获取带完整路径的上传 URL
 */
export function getUploadUrl(): string {
  return getClientApiUrl(apiPaths.files.upload);
}

export { formatFileSize };

/**
 * 客户端图片压缩配置
 */
interface CompressOptions {
  /** 最大宽度/高度（像素），默认 1920 */
  maxDimension?: number;
  /** 输出质量 (0-1)，默认 0.8 */
  quality?: number;
  /** 触发压缩的最小文件大小（字节），默认 500KB。小于此值不压缩。 */
  minSize?: number;
}

/**
 * 根据原文件类型确定压缩输出的 MIME 和扩展名
 * 保持原扩展名，避免后端白名单拒绝（如后端未启用 .webp 时不应强制转换）
 */
function getOutputFormat(fileName: string): { mime: string; ext: string } | null {
  const lastDot = fileName.lastIndexOf(".");
  const ext = lastDot > 0 ? fileName.slice(lastDot).toLowerCase() : "";
  switch (ext) {
    case ".jpg":
    case ".jpeg":
      return { mime: "image/jpeg", ext };
    case ".png":
      return { mime: "image/png", ext };
    case ".webp":
      return { mime: "image/webp", ext };
    default:
      return null;
  }
}

/**
 * 客户端图片压缩
 * 使用 Canvas API 将图片缩放并重新编码，大幅减少上传体积。
 * 保持原扩展名，避免后端文件类型白名单拒绝。
 * 3MB+ 的 JPG 通常可压缩至 500KB-1MB（JPEG, quality=0.8, maxDimension=1920）。
 *
 * @param file 原始图片文件
 * @param options 压缩选项
 * @returns 压缩后的 File（保持原扩展名）；若无需压缩则返回原文件
 */
export async function compressImage(
  file: File,
  options: CompressOptions = {},
): Promise<File> {
  const {
    maxDimension = 1920,
    quality = 0.8,
    minSize = 512 * 1024, // 500KB
  } = options;

  // 非图片文件不处理
  if (!file.type.startsWith("image/")) {
    return file;
  }

  // 小文件不压缩（避免无谓的 Canvas 开销）
  if (file.size < minSize) {
    return file;
  }

  // GIF 压缩会丢失动画，跳过
  if (file.type === "image/gif") {
    return file;
  }

  // 根据原扩展名决定输出格式（保持扩展名不变）
  const format = getOutputFormat(file.name);
  if (!format) {
    return file;
  }

  // WebP 输出需要浏览器支持
  if (format.mime === "image/webp" && !supportsWebP()) {
    return file;
  }

  try {
    const img = await loadImage(file);
    const { width, height } = calculateDimensions(
      img.width,
      img.height,
      maxDimension,
    );

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;

    // JPEG 不支持透明，需白色背景
    if (format.mime === "image/jpeg") {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
    }

    ctx.drawImage(img, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, format.mime, quality),
    );

    if (!blob || blob.size >= file.size) {
      // 压缩后反而更大（如 PNG 无损重编码），返回原文件
      return file;
    }

    // 保持原文件名（stem + 原扩展名）
    const lastDot = file.name.lastIndexOf(".");
    const stem = lastDot > 0 ? file.name.slice(0, lastDot) : file.name;
    const newName = `${stem}${format.ext}`;

    return new File([blob], newName, { type: format.mime });
  } catch {
    // 压缩失败时返回原文件，不阻断上传流程
    return file;
  }
}

/** 加载图片文件为 HTMLImageElement */
function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("图片加载失败"));
    };
    img.src = url;
  });
}

/** 按比例计算缩放后的尺寸（不放大） */
function calculateDimensions(
  origWidth: number,
  origHeight: number,
  maxDimension: number,
): { width: number; height: number } {
  if (origWidth <= maxDimension && origHeight <= maxDimension) {
    return { width: origWidth, height: origHeight };
  }
  const ratio = origWidth / origHeight;
  if (origWidth >= origHeight) {
    return {
      width: maxDimension,
      height: Math.round(maxDimension / ratio),
    };
  }
  return {
    width: Math.round(maxDimension * ratio),
    height: maxDimension,
  };
}

/** 检测浏览器是否支持 WebP 编码 */
let _webpSupported: boolean | null = null;
function supportsWebP(): boolean {
  if (_webpSupported !== null) return _webpSupported;
  _webpSupported = typeof document !== "undefined"
    && document.createElement("canvas").toDataURL("image/webp").startsWith("data:image/webp");
  return _webpSupported;
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

  // 尝试从不同格式的响应中提取缩略图 URL
  const thumbnail_url =
    data?.thumbnail_url ||
    response.thumbnail_url ||
    data?.thumbnailUrl ||
    response.thumbnailUrl;

  // 确保 URL 是完整的
  const fullUrl = getFileUrl(url);
  const fullThumbnailUrl = typeof thumbnail_url === 'string' ? getFileUrl(thumbnail_url) : undefined;

  return {
    url: fullUrl,
    thumbnail_url: fullThumbnailUrl,
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
