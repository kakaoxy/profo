"use client";

// 日期处理工具函数 - 内联避免时区问题
/** 将 Date 转为 YYYY-MM-DD 字符串 */
export const toDateStr = (d: Date | undefined | null): string | null =>
  d
    ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
    : null;

/** 将日期字符串转为 Date（容错：取前 10 位 YYYY-MM-DD，避免已带时间导致 Invalid Date） */
export const fromDateStr = (s: string | undefined | null): Date | undefined => {
  if (!s) return undefined;
  const datePart = s.slice(0, 10);
  const d = new Date(datePart + "T00:00:00");
  return isNaN(d.getTime()) ? undefined : d;
};

// 解析户型字符串为数字
export function parseLayout(layout: string | undefined): {
  rooms: number | undefined;
  halls: number | undefined;
  bathrooms: number | undefined;
} {
  if (!layout) return { rooms: undefined, halls: undefined, bathrooms: undefined };
  const match = layout.match(/(\d+)室(\d+)厅(\d+)卫/);
  if (!match) return { rooms: undefined, halls: undefined, bathrooms: undefined };
  return {
    rooms: parseInt(match[1], 10),
    halls: parseInt(match[2], 10),
    bathrooms: parseInt(match[3], 10),
  };
}

// 组合户型数字为字符串
export function buildLayout(
  rooms?: number,
  halls?: number,
  bathrooms?: number,
): string | undefined {
  const hasRooms = rooms !== undefined && rooms > 0;
  const hasHalls = halls !== undefined && halls > 0;
  const hasBathrooms = bathrooms !== undefined && bathrooms > 0;
  if (!hasRooms && !hasHalls && !hasBathrooms) return undefined;
  return `${rooms || 0}室${halls || 0}厅${bathrooms || 0}卫`;
}
