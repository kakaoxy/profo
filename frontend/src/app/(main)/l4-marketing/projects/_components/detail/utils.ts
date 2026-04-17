"use client";

import { MARKETING_PROJECT_STATUS_CONFIG, PUBLISH_STATUS_CONFIG } from "../../types";

// 状态配置 - 与 projects 保持一致
export const statusConfig: Record<string, { label: string; className: string }> = {
  "在售": {
    label: "在售",
    className: "bg-emerald-500 text-white",
  },
  "已售": {
    label: "已售",
    className: "bg-slate-400 text-white",
  },
  "在途": {
    label: "在途",
    className: "bg-blue-500 text-white",
  },
};

// 发布状态配置
export const publishStatusConfig: Record<string, { label: string; className: string }> = {
  "发布": {
    label: "已发布",
    className: "bg-emerald-500 text-white",
  },
  "草稿": {
    label: "草稿",
    className: "bg-amber-500 text-white",
  },
};

// 格式化日期
export function formatDate(dateStr?: string | null): string {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleDateString("zh-CN");
}

// 计算相对时间
export function getRelativeTime(dateStr?: string | null): string {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "今天";
  if (diffDays === 1) return "昨天";
  if (diffDays < 7) return `${diffDays} 天前`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} 周前`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} 个月前`;
  return `${Math.floor(diffDays / 365)} 年前`;
}

// 格式化价格
export function formatPrice(value: number | string | undefined | null): string {
  if (value === undefined || value === null) return "-";
  const numValue = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(numValue)) return "-";
  return `¥${numValue.toLocaleString()}`;
}

// 格式化面积
export function formatArea(value: number | string | undefined | null): string {
  if (value === undefined || value === null) return "-";
  const numValue = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(numValue)) return "-";
  return `${numValue.toLocaleString()} m²`;
}

// 获取项目状态配置
export function getStatusConfig(status: string) {
  return (
    statusConfig[status] || {
      label: status,
      className: "bg-slate-100 text-slate-600",
    }
  );
}

// 获取发布状态配置
export function getPublishStatusConfig(status: string) {
  return (
    publishStatusConfig[status] || {
      label: status,
      className: "bg-slate-100 text-slate-600",
    }
  );
}

// 获取文件URL
export function getFileUrl(url: string | undefined | null): string {
  if (!url) return "";

  // 如果已经是完整的 URL (http/https) 或者是本地预览的 Blob URL，直接返回
  if (
    url.startsWith("blob:") ||
    url.startsWith("http") ||
    url.startsWith("https") ||
    url.startsWith("data:")
  ) {
    return url;
  }

  // 如果是相对路径，拼接后端 Base URL
  const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
  const serverRoot = apiBase.replace(/\/api\/v1\/?$/, "");
  const cleanPath = url.startsWith("/") ? url : `/${url}`;
  return `${serverRoot}${cleanPath}`;
}

// 图片优化选项
interface ImageOptimizationOptions {
  width?: number;
  height?: number;
  quality?: number;
  format?: "webp" | "jpeg" | "png" | "auto";
  fit?: "cover" | "contain" | "fill" | "inside" | "outside";
}

// 获取优化后的图片 URL
// 支持多种图片优化服务：
// 1. 如果后端支持图片处理（如 /thumb/ 路径），添加尺寸参数
// 2. 如果是外部 CDN（如 Cloudinary, Imgix），添加对应的优化参数
// 3. 否则返回原图 URL
export function getOptimizedImageUrl(
  url: string | undefined | null,
  options: ImageOptimizationOptions = {}
): string {
  const baseUrl = getFileUrl(url);
  if (!baseUrl) return "";

  const { width, height, quality = 80, format = "auto", fit = "cover" } = options;

  // 如果 URL 已经包含优化参数或者是 blob/data URL，直接返回
  if (
    baseUrl.startsWith("blob:") ||
    baseUrl.startsWith("data:") ||
    baseUrl.includes("?w=") ||
    baseUrl.includes("?width=")
  ) {
    return baseUrl;
  }

  // 构建查询参数
  const params = new URLSearchParams();

  if (width) params.set("w", width.toString());
  if (height) params.set("h", height.toString());
  if (quality) params.set("q", quality.toString());
  if (format && format !== "auto") params.set("f", format);
  if (fit) params.set("fit", fit);

  const queryString = params.toString();
  if (!queryString) return baseUrl;

  // 检查 URL 是否已经有查询参数
  const separator = baseUrl.includes("?") ? "&" : "?";
  return `${baseUrl}${separator}${queryString}`;
}

// 获取响应式图片 srcset
export function getResponsiveImageSrc(
  url: string | undefined | null,
  sizes: number[] = [64, 128, 256, 512]
): string {
  const baseUrl = getFileUrl(url);
  if (!baseUrl) return "";

  return sizes
    .map((size) => {
      const optimizedUrl = getOptimizedImageUrl(baseUrl, {
        width: size,
        height: size,
        quality: 80,
      });
      return `${optimizedUrl} ${size}w`;
    })
    .join(", ");
}

// 预加载关键图片
export function preloadImage(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    img.src = getFileUrl(url);
  });
}

// 批量预加载图片（带并发控制）
export async function preloadImages(
  urls: string[],
  maxConcurrent: number = 3
): Promise<void> {
  const queue = [...urls];
  const inProgress = new Set<Promise<void>>();

  while (queue.length > 0 || inProgress.size > 0) {
    // 启动新的加载任务，直到达到并发限制
    while (inProgress.size < maxConcurrent && queue.length > 0) {
      const url = queue.shift()!;
      const promise = preloadImage(url).finally(() => {
        inProgress.delete(promise);
      });
      inProgress.add(promise);
    }

    // 等待任意一个任务完成
    if (inProgress.size > 0) {
      await Promise.race(inProgress);
    }
  }
}
