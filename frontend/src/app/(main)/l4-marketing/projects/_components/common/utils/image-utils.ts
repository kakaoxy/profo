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
// 支持多种图片优化服务：
// 1. 如果后端支持图片处理（如 /thumb/ 路径），添加尺寸参数
// 2. 如果是外部 CDN（如 Cloudinary, Imgix），添加对应的优化参数
// 3. 否则返回原图 URL
export function getOptimizedImageUrl(
  url: string | undefined | null,
  options?: ImageOptimizationOptions
): string {
  const baseUrl = getFileUrl(url);
  if (!baseUrl) return "";

  if (baseUrl.startsWith("blob:") || baseUrl.startsWith("data:")) {
    return baseUrl;
  }

  // 构建查询参数
  const params = new URLSearchParams();
  if (options?.width) params.set("w", options.width.toString());
  if (options?.height) params.set("h", options.height.toString());
  if (options?.quality) params.set("q", options.quality.toString());
  if (options?.format && options.format !== "auto") params.set("fmt", options.format);
  if (options?.fit) params.set("fit", options.fit);

  const queryString = params.toString();
  return queryString ? `${baseUrl}?${queryString}` : baseUrl;
}

// 获取响应式图片 srcset
export function getResponsiveImageSrc(
  url: string | undefined | null,
  sizes?: number[]
): string {
  const baseUrl = getFileUrl(url);
  if (!baseUrl) return "";

  if (!sizes || sizes.length === 0) {
    return baseUrl;
  }

  // 生成 srcset：为每个尺寸生成优化后的 URL
  const srcset = sizes
    .map((size) => {
      const optimized = getOptimizedImageUrl(baseUrl, { width: size });
      return `${optimized} ${size}w`;
    })
    .join(", ");

  return srcset || baseUrl;
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
