/**
 * 将字符串或数字转换为数字类型
 * @param value - 要转换的值（字符串、数字、null 或 undefined）
 * @returns 转换后的数字，如果转换失败则返回 undefined
 */
export function toNumber(value: string | number | null | undefined): number | undefined {
  if (value === null || value === undefined || value === "") {
    return undefined;
  }
  const num = typeof value === "string" ? parseFloat(value) : value;
  return isNaN(num) ? undefined : num;
}
