"use client";

import {
  getFileUrl,
  getOptimizedImageUrl,
  preloadImage,
  preloadImages,
} from "../common/utils";
import {
  STATUS_CONFIG,
  PUBLISH_STATUS_CONFIG,
  PROJECT_STATUS_MAPPING,
  getProjectStatusClassName,
} from "@/lib/status-colors";

// 格式化日期
export function formatDate(dateStr?: string | null): string {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleDateString("zh-CN");
}

// 获取项目状态配置
export function getStatusConfig(status: string) {
  const mapped = PROJECT_STATUS_MAPPING[status];
  if (mapped) {
    const config = STATUS_CONFIG[mapped];
    return {
      label: config?.label || status,
      className: getProjectStatusClassName(mapped),
    };
  }
  return {
    label: status,
    className: "bg-muted text-muted-foreground",
  };
}

// 获取发布状态配置
export function getPublishStatusConfig(status: string) {
  const labelMap: Record<string, keyof typeof PUBLISH_STATUS_CONFIG> = {
    "发布": "published",
    "草稿": "draft",
  };
  const mapped = labelMap[status];
  if (mapped) {
    const config = PUBLISH_STATUS_CONFIG[mapped];
    const classMap: Record<keyof typeof PUBLISH_STATUS_CONFIG, string> = {
      published: "bg-status-selling text-white",
      draft: "bg-status-pending text-white",
    };
    return {
      label: config.label,
      className: classMap[mapped],
    };
  }
  return {
    label: status,
    className: "bg-muted text-muted-foreground",
  };
}

// 从 common/utils 重新导出图片相关函数（保持向后兼容）
export { getFileUrl, getOptimizedImageUrl, preloadImage, preloadImages };
