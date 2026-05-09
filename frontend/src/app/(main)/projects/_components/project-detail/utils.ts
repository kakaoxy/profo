/**
 * 项目详情相关工具函数
 */

import { getFileUrl as getConfigFileUrl } from "@/lib/config";
import { formatPrice } from "@/lib/formatters";

export function formatDate(dateStr?: string | null): string {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleDateString("zh-CN");
}

// 计算距离目标日期的天数
export function getDaysUntil(dateStr?: string | null): number | null {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

export { formatPrice };

// 获取文件URL
// 复用 config.ts 中的实现，保持行为一致
export function getFileUrl(url: string | undefined | null): string {
  return getConfigFileUrl(url);
}
