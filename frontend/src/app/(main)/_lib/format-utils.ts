// 格式化金额：超过1万显示 "xx万"，否则显示原始金额
export function formatCurrency(amount?: number | string): string {
  if (!amount) return "-";
  const num = Number(amount);
  if (isNaN(num)) return "-";

  if (num >= 10000) {
    return `${(num / 10000).toFixed(1).replace(/\.0$/, "")}万`;
  }
  return num.toLocaleString();
}

// 格式化相对时间
export function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes}分钟前`;
  if (hours < 24) return `${hours}小时前`;
  if (days < 7) return `${days}天前`;
  return date.toLocaleDateString("zh-CN");
}
