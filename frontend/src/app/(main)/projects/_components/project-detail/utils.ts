/**
 * 项目详情相关工具函数
 */

// 格式化日期
export function formatDate(dateStr?: string | null): string {
  if (!dateStr) return "";
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

// 计算距离目标日期的天数
export function getDaysUntil(dateStr?: string | null): number | null {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

// 格式化金额（带千分位）
export function formatPrice(price?: number | null): string {
  if (price === undefined || price === null) return "";
  return `¥ ${price.toLocaleString("zh-CN")} 万`;
}

// 获取状态颜色
export function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    签约中: "bg-blue-500",
    装修中: "bg-orange-500",
    在售: "bg-green-500",
    已成交: "bg-purple-500",
    已结束: "bg-gray-500",
  };
  return colors[status] || "bg-gray-500";
}
