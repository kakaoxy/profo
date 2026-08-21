/**
 * 小区市场分析页常量：枚举、文案与示例数据（sample 模式内置静态数据）.
 * 单独成文件以控制 index.ts 行数；示例数据字段与 api-types 对应类型完全一致.
 */

import type { components } from "../../../types/api-types";

type KpiData = components["schemas"]["KpiData"];
type TrendDataPoint = components["schemas"]["TrendDataPoint"];
type PriceDistributionResponse = components["schemas"]["PriceDistributionResponse"];
type DistributionResponse = components["schemas"]["DistributionResponse"];

/** 时间范围选项（value 对应后端 RangeOption）. */
export interface RangeOptionItem {
  value: string;
  label: string;
}

export const RANGE_OPTIONS: RangeOptionItem[] = [
  { value: "4w", label: "近4周" },
  { value: "8w", label: "近8周" },
  { value: "6m", label: "近6个月" },
  { value: "12m", label: "近12个月" },
  { value: "24m", label: "近24个月" },
];

/** 默认时间范围：近12个月. */
export const DEFAULT_RANGE = "12m";

/** 趋势维度选项（value 对应后端 TrendDimension）. */
export interface TrendDimOptionItem {
  value: string;
  label: string;
}

export const TREND_DIM_OPTIONS: TrendDimOptionItem[] = [
  { value: "overall", label: "综合" },
  { value: "rooms", label: "户型" },
  { value: "floor", label: "楼层" },
];

export const DEFAULT_TREND_DIM = "overall";

/** 图表/数值模式选项. */
export interface ModeOptionItem {
  value: string;
  label: string;
}

export const MODE_OPTIONS: ModeOptionItem[] = [
  { value: "chart", label: "图表" },
  { value: "table", label: "数值" },
];

export const DEFAULT_TREND_MODE = "chart";
export const DEFAULT_DIST_MODE = "chart";

/** 筛选面板标识（仅范围面板）. */
export type FilterKey = "" | "range";

/** 两种模式底部免责声明. */
export const DISCLAIMER_TEXT = "数据来源为业主反馈网签数据仅供参考";

/** 小区解析不到时的空态文案. */
export const EMPTY_COMMUNITY_TEXT = "暂不支持该小区市场分析";

/** sample 模式：示例小区名与主力户型. */
export const SAMPLE_COMMUNITY_NAME = "阳光花园";
export const SAMPLE_MAIN_LAYOUT = "3室 · 89㎡";

/** sample 模式转化 CTA 文案. */
export const SAMPLE_CTA_TITLE = "提交估价并绑定手机号，解锁您小区的市场分析";
export const SAMPLE_CTA_DESC = "解锁后即可查看真实成交趋势与价格分布";

/* ===== sample 模式示例数据（字段与 api-types 对应类型一致） ===== */

/** 示例 KPI（KpiData：4 张卡片，各含 value/qoq/qoq_direction）. */
export const SAMPLE_KPI: KpiData = {
  sold_count: { value: 102, qoq: 12.5, qoq_direction: "up" },
  avg_price_wan: { value: 268, qoq: 2.1, qoq_direction: "up" },
  avg_unit_price: { value: 28360, qoq: -1.2, qoq_direction: "down" },
  on_sale_count: { value: 45, qoq: 0, qoq_direction: "flat" },
};

/** 示例趋势各月原始序列（12 个月，period 取每月 1 日）. */
const SAMPLE_PERIODS = [
  "2025-09-01", "2025-10-01", "2025-11-01", "2025-12-01",
  "2026-01-01", "2026-02-01", "2026-03-01", "2026-04-01",
  "2026-05-01", "2026-06-01", "2026-07-01", "2026-08-01",
];
const SAMPLE_VOLUMES = [5, 7, 6, 8, 9, 7, 10, 11, 9, 12, 13, 11];
const SAMPLE_PRICES_WAN = [312, 315, 318, 320, 325, 322, 330, 335, 338, 342, 345, 348];
const SAMPLE_UNIT_PRICES = [28600, 28800, 28900, 29200, 29600, 29300, 30100, 30500, 30800, 31000, 31500, 31200];

/** 环比百分比（保留 1 位小数）. */
function pctChange(cur: number, prev: number): number {
  if (prev === 0) return 0;
  return Math.round(((cur - prev) / prev) * 1000) / 10;
}

/** 维度下钻：rooms（1室/2室/3室/4室+）与 floor（高楼层/中楼层/低楼层）各自 volume 与 avg_unit_price. */
function buildDimBreakdown(volume: number, baseUnit: number): TrendDataPoint["dim_breakdown"] {
  return {
    rooms: {
      "1室": { volume: Math.max(1, Math.round(volume * 0.15)), avg_unit_price: Math.round(baseUnit * 1.08) },
      "2室": { volume: Math.max(1, Math.round(volume * 0.3)), avg_unit_price: Math.round(baseUnit * 1.02) },
      "3室": { volume: Math.max(1, Math.round(volume * 0.35)), avg_unit_price: Math.round(baseUnit * 0.98) },
      "4室+": { volume: Math.max(1, Math.round(volume * 0.2)), avg_unit_price: Math.round(baseUnit * 0.95) },
    },
    floor: {
      "高楼层": { volume: Math.max(1, Math.round(volume * 0.4)), avg_unit_price: Math.round(baseUnit * 1.05) },
      "中楼层": { volume: Math.max(1, Math.round(volume * 0.35)), avg_unit_price: Math.round(baseUnit * 1.0) },
      "低楼层": { volume: Math.max(1, Math.round(volume * 0.25)), avg_unit_price: Math.round(baseUnit * 0.94) },
    },
  };
}

/** 示例趋势（含 dim_breakdown，维度切换有内容）. */
export const SAMPLE_TREND: TrendDataPoint[] = SAMPLE_PERIODS.map((period, i) => {
  const volume = SAMPLE_VOLUMES[i];
  const unitPrice = SAMPLE_UNIT_PRICES[i];
  return {
    period,
    volume,
    avg_price_wan: SAMPLE_PRICES_WAN[i],
    avg_unit_price: unitPrice,
    volume_qoq: i === 0 ? null : pctChange(volume, SAMPLE_VOLUMES[i - 1]),
    price_qoq: i === 0 ? null : pctChange(unitPrice, SAMPLE_UNIT_PRICES[i - 1]),
    dim_breakdown: buildDimBreakdown(volume, unitPrice),
  };
});

/** 示例价格分布（PriceDistributionResponse）. */
export const SAMPLE_PRICE_DIST: PriceDistributionResponse = {
  total: 102,
  buckets: [
    { label: "<150", lower: 0, upper: 150, count: 6, avg_area: 62, avg_unit_price: 23500 },
    { label: "150-200万", lower: 150, upper: 200, count: 21, avg_area: 78, avg_unit_price: 24500 },
    { label: "200-250万", lower: 200, upper: 250, count: 33, avg_area: 88, avg_unit_price: 26200 },
    { label: "250-300万", lower: 250, upper: 300, count: 27, avg_area: 96, avg_unit_price: 28600 },
    { label: "300-350万", lower: 300, upper: 350, count: 11, avg_area: 104, avg_unit_price: 31200 },
    { label: "350+", lower: 350, upper: null, count: 4, avg_area: 118, avg_unit_price: 33800 },
  ],
};

/** 示例户型分布（DistributionResponse）. */
export const SAMPLE_ROOMS_DIST: DistributionResponse = {
  total: 102,
  buckets: [
    { label: "1室", count: 12, avg_area: 46, avg_unit_price: 26800 },
    { label: "2室", count: 35, avg_area: 72, avg_unit_price: 25600 },
    { label: "3室", count: 41, avg_area: 95, avg_unit_price: 28400 },
    { label: "4室+", count: 14, avg_area: 122, avg_unit_price: 30800 },
  ],
};

/** 示例楼层分布（DistributionResponse）. */
export const SAMPLE_FLOOR_DIST: DistributionResponse = {
  total: 102,
  buckets: [
    { label: "高楼层", count: 38, avg_area: 88, avg_unit_price: 29600 },
    { label: "中楼层", count: 42, avg_area: 86, avg_unit_price: 28200 },
    { label: "低楼层", count: 22, avg_area: 84, avg_unit_price: 26600 },
  ],
};
