/**
 * 共享校验工具函数
 * 用于防御 API 返回的脏数据导致前端崩溃
 */

/**
 * 校验字符串是否为合法的绝对 URL（http/https）
 * 过滤数据库中的脏数据如 "q_80" 等非 URL 字符串
 */
export const isValidUrl = (str: string): boolean => {
  try {
    const url = new URL(str);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
};

/**
 * 安全地解析日期字符串，返回 Date 或 null
 * 替代裸 new Date()，防止 Invalid Date 向下传播
 */
export const safeParseDate = (
  value: string | null | undefined,
): Date | null => {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
};
