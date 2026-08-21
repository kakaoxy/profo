/**
 * 数据分析页视图构建纯函数（页面专用部分）：面板单选视图与商圈 chip 文案.
 * 通用视图纯函数已下沉至 ../../../utils/report-views，此处 re-export 以兼容既有导入.
 */

import { DEFAULT_BUSINESS_CHIP, RANGE_OPTIONS, STATUS_OPTIONS } from "./constants";

export { buildDistViews, buildKpiViews, buildQoqCell, buildTrendTable, formatInt } from "../../../utils/report-views";
export type {
  DistBucketLike,
  DistView,
  DistViewsResult,
  KpiView,
  QoqCell,
  TrendTableRow,
} from "../../../utils/report-views";

/** 面板单选视图. */
export interface OptionView {
  value: string;
  label: string;
  selected: boolean;
}

/** 范围面板单选视图. */
export function buildRangeViews(draft: string): OptionView[] {
  return RANGE_OPTIONS.map((o) => ({ value: o.value, label: o.label, selected: o.value === draft }));
}

/** 状态面板单选视图. */
export function buildStatusViews(draft: string): OptionView[] {
  return STATUS_OPTIONS.map((o) => ({ value: o.value, label: o.label, selected: o.value === draft }));
}

/** 商圈 chip 文案：商圈 · 朝阳区/国贸. */
export function buildBusinessChipLabel(district: string, circle: string): string {
  if (district && circle) return `商圈 · ${district}/${circle}`;
  if (district) return `商圈 · ${district}`;
  if (circle) return `商圈 · ${circle}`;
  return DEFAULT_BUSINESS_CHIP;
}
