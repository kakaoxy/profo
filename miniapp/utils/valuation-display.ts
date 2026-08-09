/**
 * 「我的评估」纯展示工具：日期格式化 / 跟进方式映射 / 跟进记录前端分页 / 状态徽章样式.
 *
 * 全部为无副作用纯函数，供列表页与详情页复用，并用 vitest 单测覆盖.
 */

/** 跟进方式中文映射表（未知 code 原样返回） */
const FOLLOWUP_METHOD_LABELS: Record<string, string> = {
  phone: "电话",
  wechat: "微信",
  face: "面谈",
  visit: "带看",
};

/** 两位补零 */
function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** 将 #RGB / #RRGGBB 解析为 rgba 字符串；非 hex 色值原样返回. */
function toRgba(color: string, alpha: number): string {
  const rgb = color.match(/^#([0-9a-fA-F]{6})$/);
  if (rgb) {
    const n = parseInt(rgb[1], 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
  }
  const short = color.match(/^#([0-9a-fA-F]{3})$/);
  if (short) {
    const v = short[1];
    const r = parseInt(v[0] + v[0], 16);
    const g = parseInt(v[1] + v[1], 16);
    const b = parseInt(v[2] + v[2], 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return color;
}

/**
 * 格式化日期为 YYYY-MM-DD（withTime=false）或 YYYY-MM-DD HH:mm（withTime=true）.
 * 非法 / 空日期返回 "—".
 */
export function formatDate(iso: string, withTime = false): string {
  if (!iso) {
    return "—";
  }
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return "—";
  }
  const date = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  if (!withTime) {
    return date;
  }
  return `${date} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** 跟进方式中文映射：phone→电话 / wechat→微信 / face→面谈 / visit→带看，未知原样返回. */
export function followupMethodLabel(method: string): string {
  return FOLLOWUP_METHOD_LABELS[method] ?? method;
}

/**
 * 跟进记录前端分页切片（基于详情接口内嵌的已倒序 follow_ups）.
 * page 从 1 开始；页码越界或 pageSize < 1 返回空数组.
 */
export function sliceFollowups<T>(all: T[], page: number, pageSize: number): T[] {
  if (page < 1 || pageSize < 1) {
    return [];
  }
  const start = (page - 1) * pageSize;
  if (start >= all.length) {
    return [];
  }
  return all.slice(start, start + pageSize);
}

/**
 * 状态徽章样式：前景用状态色，背景用状态色 + 20% 透明度.
 */
export function statusBadgeStyle(color: string): { color: string; background: string } {
  return { color, background: toRgba(color, 0.2) };
}
