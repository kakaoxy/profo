/**
 * 项目详情相关工具函数
 */

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
  if (price === undefined || price === null) return "-";
  // Determine if we need to divide by 10000 (usually backend sends cents or units, user request implies correction needed)
  // However, user manually changed call site. Let's stick to simple formatting here for now unless specified.
  // User manual change was: formatPrice(project.net_cash_flow/10000)
  return `¥ ${price.toLocaleString("zh-CN", { maximumFractionDigits: 2 })} 万`;
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

export function getFileUrl(url: string | undefined | null) {
  if (!url) return "";

  // 1. 如果已经是完整的 URL (http/https) 或者是本地预览的 Blob URL，直接返回
  if (
    url.startsWith("blob:") ||
    url.startsWith("http") ||
    url.startsWith("https")
  ) {
    return url;
  }

  // 2. 如果是相对路径，我们需要拼接后端的 Base URL
  // 环境变量通常是 http://localhost:8000/api/v1，我们需要去掉后面的 /api/v1
  const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

  // 简单的正则替换：去掉结尾的 /api/v1 (如果有的话)，得到 http://localhost:8000
  const serverRoot = apiBase.replace(/\/api\/v1\/?$/, "");

  // 确保 url 以 / 开头
  const cleanPath = url.startsWith("/") ? url : `/${url}`;

  // 拼接：http://localhost:8000 + /static/uploads/xxx.jpg
  return `${serverRoot}${cleanPath}`;
}
