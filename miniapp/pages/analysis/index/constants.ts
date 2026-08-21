/**
 * 数据分析页常量：枚举、标签与默认值.
 * 单独成文件以控制 index.ts 行数（合计建议 <500 行）.
 */

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

/** 状态选项（value 为空串表示全部，不传参）. */
export interface StatusOptionItem {
  value: string;
  label: string;
}

export const STATUS_OPTIONS: StatusOptionItem[] = [
  { value: "", label: "全部" },
  { value: "在售", label: "在售" },
  { value: "成交", label: "成交" },
];

/** 默认状态：全部. */
export const DEFAULT_STATUS = "";

/** 趋势维度选项（value 对应后端 TrendDimension；价格段不开放）. */
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

/** 筛选面板标识（商圈走原生 picker，无面板）. */
export type FilterKey = "" | "range" | "status";

/** 商圈多列选择器占位项. */
export const ALL_DISTRICT = "全部区域";
export const ALL_BUSINESS_CIRCLE = "全部商圈";

/** 商圈 chip 默认文案. */
export const DEFAULT_BUSINESS_CHIP = "商圈 · 全部";

/** 分布卡空态文案. */
export const EMPTY_DIST_TEXT = "该筛选下暂无成交样本";
