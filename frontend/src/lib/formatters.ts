/**
 * 格式化工具函数
 * 统一处理价格、面积等数值的格式化显示
 */

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
 * @param value - 单价值（字符串或数字）
 * @returns 格式化后的单价字符串，如 "¥10,000/㎡"
 */
export function formatUnitPrice(
  value: string | number | undefined | null,
): string {
  if (value === undefined || value === null) return "-";
  const numValue = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(numValue)) return "-";
  return `¥${numValue.toLocaleString()}/㎡`;
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
