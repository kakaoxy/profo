/**
 * 报表模块专用格式化工具。
 *
 * 优先复用 `@/lib/formatters` 中的通用函数（formatCount/formatPriceWan/
 * formatUnitPriceWan/formatTrendPercent/formatPercent），仅补充报表特有的
 * 均价/单价(元)/面积/去化月数/环比/范围/周期等格式化能力。
 */
import { format, getISOWeek } from "date-fns";
import {
  formatCount,
  formatPercent,
  formatPriceWan,
  formatTrendPercent,
  formatUnitPriceWan,
} from "@/lib/formatters";
import type { Granularity, RangeOption } from "./types";

// 模块级 Intl 实例，避免每次渲染重建
const oneDigitFormatter = new Intl.NumberFormat("zh-CN", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const intFormatter = new Intl.NumberFormat("zh-CN");

/** 平均成交价 "486.5万" */
export function formatAvgPriceWan(value: number | null): string {
  return value !== null ? `${oneDigitFormatter.format(value)}万` : "-";
}

/** 平均单价 "68,000元/㎡" */
export function formatUnitPriceYuan(value: number | null): string {
  return value !== null ? `${intFormatter.format(Math.round(value))}元/㎡` : "-";
}

/** 面积 "89.5㎡" */
export function formatAreaSqm(value: number | null): string {
  return value !== null ? `${oneDigitFormatter.format(value)}㎡` : "-";
}

/** 去化月数 "3.2月" 或 "—" */
export function formatAbsorptionMonths(value: number | null): string {
  return value !== null ? `${oneDigitFormatter.format(value)}月` : "—";
}

export interface QoqFormat {
  text: string;
  direction: "up" | "down" | "flat" | "unknown";
}

/** 环比 "+1.5%" / "-2.3%" / "0.0%" / "—" */
export function formatQoq(value: number | null): QoqFormat {
  if (value === null) return { text: "—", direction: "unknown" };
  if (value === 0) return { text: "0.0%", direction: "flat" };
  const sign = value > 0 ? "+" : "";
  return {
    text: `${sign}${oneDigitFormatter.format(value)}%`,
    direction: value > 0 ? "up" : "down",
  };
}

/** 范围文案 "近4周" / "近6个月" */
export function formatRange(range: RangeOption): string {
  switch (range) {
    case "4w":
      return "近4周";
    case "8w":
      return "近8周";
    case "6m":
      return "近6个月";
    case "12m":
      return "近12个月";
    case "24m":
      return "近24个月";
  }
}

/**
 * 周期标签格式化。
 * @param period ISO 日期字符串（周期起始日 YYYY-MM-DD）
 * @param granularity week → "W28"；month → "2026-07"
 */
export function formatPeriod(period: string, granularity: Granularity): string {
  const d = new Date(`${period}T00:00:00`);
  if (isNaN(d.getTime())) return period;
  if (granularity === "week") {
    return `W${getISOWeek(d)}`;
  }
  return format(d, "yyyy-MM");
}

// 重新导出通用格式化函数，便于报表组件统一从本模块引入
export {
  formatCount,
  formatPercent,
  formatPriceWan,
  formatTrendPercent,
  formatUnitPriceWan,
};
