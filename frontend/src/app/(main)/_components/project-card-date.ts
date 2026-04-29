/**
 * 项目卡片日期工具函数
 */

// 获取本周一和上周一（按日历周计算）
export function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // 调整为周一开始
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}
