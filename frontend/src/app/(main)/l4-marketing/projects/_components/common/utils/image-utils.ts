"use client";

import { getFileUrl as getConfigFileUrl } from "@/lib/config";

// 图片优化选项
export interface ImageOptimizationOptions {
  width?: number;
  height?: number;
  quality?: number;
  format?: "webp" | "jpeg" | "png" | "auto";
  fit?: "cover" | "contain" | "fill" | "inside" | "outside";
}

// 获取文件URL
// 复用 config.ts 中的实现，保持行为一致
export function getFileUrl(url: string | undefined | null): string {
  return getConfigFileUrl(url);
}

// 获取优化后的图片 URL
// 当前后端暂无图片处理服务，此函数保留参数接口供未来扩展
// 如需接入图片处理服务（如 Cloudinary, Imgix 或自研 /thumb/ 路径），
// 可在此统一修改参数格式，无需改动调用方
export function getOptimizedImageUrl(
  url: string | undefined | null,
  options?: ImageOptimizationOptions
): string {
  const baseUrl = getFileUrl(url);
  if (!baseUrl) return "";

  if (baseUrl.startsWith("blob:") || baseUrl.startsWith("data:")) {
    return baseUrl;
  }

  // 当前后端未实现图片处理，直接返回原图 URL
  // 参数 options 保留用于未来接入 CDN 或图片处理服务
  void options;
  return baseUrl;
}

// 获取响应式图片 srcset
// ⚠️ 警告：当前后端暂无图片处理服务，此函数暂时禁用响应式生成功能
// 因为 getOptimizedImageUrl 会直接返回原图 URL，导致所有尺寸返回相同的 URL
// 浏览器无法根据设备像素密度选择合适的图片，srcset 失去意义
export function getResponsiveImageSrc(
  url: string | undefined | null,
  _sizes?: number[]
): string {
  void _sizes;
  const baseUrl = getFileUrl(url);
  if (!baseUrl) return "";

  // 暂时返回单一原图 URL，避免生成误导性的 srcset
  // 待后端接入图片处理服务后，可恢复为不同尺寸生成不同 URL 的逻辑
  return baseUrl;
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
