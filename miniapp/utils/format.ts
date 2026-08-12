/**
 * 通用格式化工具：纯函数，供列表/详情等多页面复用.
 */

/** 两位补零（月份/日期/时/分等）. */
export function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** 千位分隔符格式化（NaN/负数兜底返回 "0"）. */
export function formatThousands(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "0";
  return Math.floor(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
