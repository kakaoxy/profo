// 统计页本地格式化工具：与统计页参考 HTML 的 "0"/"¥0" 回退语义对齐
// (项目通用 formatters.ts 的回退是 "-"，不适用于 KPI 卡片场景)

/**
 * 格式化货币金额，空值回退 `${prefix}0`
 * @param value 数值（可为 null/undefined）
 * @param prefix 货币前缀，默认 "¥"
 */
export function formatCurrency(value: number | null | undefined, prefix = "¥"): string {
  if (value == null || isNaN(value)) return `${prefix}0`;
  return prefix + value.toLocaleString("zh-CN");
}

/**
 * 格式化纯数字，空值回退 "0"
 * @param value 数值（可为 null/undefined）
 */
export function formatNumber(value: number | null | undefined): string {
  if (value == null || isNaN(value)) return "0";
  return value.toLocaleString("zh-CN");
}

/**
 * 格式化百分比，空值回退 "0%"
 * @param value 百分比数值（如 40.5 表示 40.5%）
 * @param digits 小数位数，默认 1
 */
export function formatPercent(value: number | null | undefined, digits = 1): string {
  if (value == null || isNaN(value)) return "0%";
  return `${value.toFixed(digits)}%`;
}

/**
 * 格式化日期，去除时间部分（T00:00:00），仅保留 YYYY-MM-DD
 * @param value ISO 日期字符串（可为 null/undefined）
 * @param fallback 空值回退文案，默认 "-"
 */
export function formatDate(value: string | null | undefined, fallback = "-"): string {
  if (!value) return fallback;
  return value.slice(0, 10);
}
