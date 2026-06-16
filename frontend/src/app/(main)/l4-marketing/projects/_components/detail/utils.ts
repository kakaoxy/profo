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
  PUBLISH_STATUS_MAPPING,
  PUBLISH_STATUS_CLASS_MAP,
  PROJECT_STATUS_MAPPING,
  getProjectStatusClassName,
} from "@/lib/status-colors";

// 格式化日期
export function formatDate(dateStr?: string | null): string {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("zh-CN");
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
  const mapped = PUBLISH_STATUS_MAPPING[status];
  if (mapped) {
    const config = PUBLISH_STATUS_CONFIG[mapped];
    return {
      label: config.label,
      className: PUBLISH_STATUS_CLASS_MAP[mapped],
    };
  }
  return {
    label: status,
    className: "bg-muted text-muted-foreground",
  };
}

// 从 common/utils 重新导出图片相关函数（保持向后兼容）
export { getFileUrl, getOptimizedImageUrl, preloadImage, preloadImages };
