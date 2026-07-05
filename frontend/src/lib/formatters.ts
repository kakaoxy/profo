import { format, formatDistanceToNow } from "date-fns";
import { zhCN } from "date-fns/locale";

/**
 * 格式化工具函数
 * 统一处理价格、面积等数值的格式化显示
 */

/**
 * 安全地格式化日期字符串，防止 "Invalid time value" 错误
 * 当输入为空或无效时返回 fallback
 */
export function safeFormatDate(
  dateStr: string | null | undefined,
  fmt: string,
  fallback = "-"
): string {
  if (!dateStr) return fallback;
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return fallback;
    return format(d, fmt, { locale: zhCN });
  } catch {
    return fallback;
  }
}

/**
 * 格式化总价显示
 * @param value - 价格值（字符串或数字）
 * @returns 格式化后的价格字符串，如 "¥1,000万"
 */
export function formatPrice(value: string | number | undefined | null): string {
  if (value === undefined || value === null) return "-";
  const numValue = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(numValue)) return "-";
  return `¥${numValue.toLocaleString()}万`;
}

/**
 * 格式化单价显示
 * @param value - 单价值（字符串或数字），单位：万元/㎡
 * @returns 格式化后的单价字符串，如 "¥3.84万/㎡"
 */
export function formatUnitPrice(
  value: string | number | undefined | null,
): string {
  if (value === undefined || value === null || value === "") return "-";
  const numValue = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(numValue) || numValue === 0) return "-";
  return `¥${numValue.toFixed(2)}万/㎡`;
}

/**
 * 格式化面积显示
 * @param value - 面积值（字符串或数字）
 * @returns 格式化后的面积字符串，如 "100 m²"
 */
export function formatArea(value: string | number | undefined | null): string {
  if (value === undefined || value === null) return "-";
  const numValue = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(numValue)) return "-";
  return `${numValue.toLocaleString()} m²`;
}

/**
 * 格式化数字显示（通用）
 * @param value - 数值（字符串或数字）
 * @param suffix - 后缀单位
 * @returns 格式化后的数字字符串
 */
export function formatNumber(
  value: string | number | undefined | null,
  suffix = "",
): string {
  if (value === undefined || value === null) return "-";
  const numValue = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(numValue)) return "-";
  return `${numValue.toLocaleString()}${suffix}`;
}

/**
 * 格式化相对时间（安全版本）
 * @param date - 日期（Date 或 ISO 字符串）
 * @param fallback - 无效时的回退值
 * @returns 相对时间字符串，如 "约1小时前"
 */
export function formatRelativeTime(
  date: Date | string | null | undefined,
  fallback = "-",
): string {
  if (!date) return fallback;
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return fallback;
  try {
    return formatDistanceToNow(d, { addSuffix: true, locale: zhCN });
  } catch {
    return fallback;
  }
}

/**
 * 格式化文件大小显示
 * @param bytes - 文件大小（字节）
 * @returns 格式化后的文件大小字符串，如 "10 MB"
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

/**
 * 格式化人民币金额（元，两位小数 + 千分位）
 * @param value - 金额值（字符串或数字）
 * @returns 格式化后的金额字符串，如 "¥8,000,000.00"
 */
export function formatCNY(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "¥0.00";
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(num)) return "¥0.00";
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
}

/**
 * 格式化百分比
 * @param value - 百分比数值（如 40.0 表示 40.0%）
 * @param digits - 小数位数，默认 1
 * @returns 格式化后的百分比字符串，如 "40.0%"
 */
export function formatPercent(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || isNaN(value)) return "0.0%";
  return `${value.toFixed(digits)}%`;
}
