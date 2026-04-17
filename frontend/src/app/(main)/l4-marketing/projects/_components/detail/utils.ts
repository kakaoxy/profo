"use client";

import {
  getFileUrl,
  getOptimizedImageUrl,
  getResponsiveImageSrc,
  preloadImage,
  preloadImages,
} from "../common/utils";

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

// 从 common/utils 重新导出图片相关函数（保持向后兼容）
export { getFileUrl, getOptimizedImageUrl, getResponsiveImageSrc, preloadImage, preloadImages };
