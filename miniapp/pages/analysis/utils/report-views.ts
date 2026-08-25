/**
 * 报表视图构建通用纯函数：将后端响应映射为 WXML 直接可读的结构.
 * 分析页与新报表页等共用；分析页专用逻辑（面板单选/商圈 chip）保留在页面 views.ts.
 */

import type { components } from "../../../types/api-types";
import { formatThousands } from "../../../utils/format";
import { formatPeriodLabel } from "./trend-chart";
import type { TrendGranularity } from "./trend-chart";

type KpiCard = components["schemas"]["KpiCard"];
type KpiData = components["schemas"]["KpiData"];
type TrendDataPoint = components["schemas"]["TrendDataPoint"];

/** 分布桶最小结构（价格/户型/楼层桶字段一致）. */
export interface DistBucketLike {
  label: string;
  count: number;
  avg_area?: number | null;
  avg_unit_price?: number | null;
}

/** 趋势表/分布表环比单元格展示. */
export interface QoqCell {
  text: string;
  cls: "up" | "down" | "flat";
}

/** KPI 卡片展示. */
export interface KpiView {
  key: string;
  label: string;
  valueText: string;
  unit: string;
  arrow: string;
  qoqText: string;
  qoqClass: string;
  showHint: boolean;
}

/** 趋势数值表行（维度非 overall 时含分类明细）. */
export interface TrendTableRow {
  period: string;
  volumeText: string;
  volumeQoq: QoqCell;
  avgPriceText: string;
  priceQoq: QoqCell;
  unitText: string;
  dims: { key: string; volumeText: string; unitText: string }[];
}

/** 分布行展示. */
export interface DistView {
  label: string;
  countText: string;
  pct: number;
  pctText: string;
  avgAreaText: string;
  avgUnitText: string;
}

/** 分布视图结果. */
export interface DistViewsResult {
  rows: DistView[];
  totalText: string;
  empty: boolean;
}

/** 由 qoq 值推导方向. */
function qoqDir(qoq: number | null | undefined): "up" | "down" | "flat" | "unknown" {
  if (qoq === null || qoq === undefined) return "unknown";
  if (qoq > 0) return "up";
  if (qoq < 0) return "down";
  return "flat";
}

/** 趋势表环比单元格：null→—；0→0.0%；±x.x%. */
export function buildQoqCell(qoq: number | null | undefined): QoqCell {
  const dir = qoqDir(qoq);
  if (dir === "unknown") return { text: "—", cls: "flat" };
  if (dir === "flat") return { text: "0.0%", cls: "flat" };
  const sign = qoq && qoq > 0 ? "+" : "";
  return { text: `${sign}${(qoq as number).toFixed(1)}%`, cls: dir };
}

/** KPI 环比指示器：up→红▲/down→绿▼/flat→灰—；qoq=null→—. */
function buildKpiQoq(card: KpiCard): { arrow: string; text: string; cls: string; showHint: boolean } {
  const qoq = card.qoq;
  const dir = card.qoq_direction;
  if (qoq === null || qoq === undefined || dir === "unknown") {
    return { arrow: "", text: "—", cls: "flat", showHint: false };
  }
  if (dir === "flat" || qoq === 0) {
    return { arrow: "", text: "—", cls: "flat", showHint: false };
  }
  const sign = qoq > 0 ? "+" : "";
  return {
    arrow: dir === "up" ? "▲" : "▼",
    text: `${sign}${qoq.toFixed(1)}%`,
    cls: dir,
    showHint: true,
  };
}

/** 千分位整数值（null → —）. */
export function formatInt(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return formatThousands(Math.round(value));
}

/** KPI 2×2 卡片视图. */
export function buildKpiViews(kpi: KpiData): KpiView[] {
  const toView = (card: KpiCard, key: string, label: string, unit: string): KpiView => {
    const qoq = buildKpiQoq(card);
    return {
      key,
      label,
      valueText: formatInt(card.value),
      unit: card.value === null || card.value === undefined ? "" : unit,
      arrow: qoq.arrow,
      qoqText: qoq.text,
      qoqClass: qoq.cls,
      showHint: qoq.showHint,
    };
  };
  return [
    toView(kpi.sold_count, "sold", "成交套数", "套"),
    toView(kpi.avg_price_wan, "price", "平均成交价", "万"),
    toView(kpi.avg_unit_price, "unit", "平均单价", "元/㎡"),
    toView(kpi.on_sale_count, "on_sale", "在售房源", "套"),
  ];
}

/** 趋势数值表行（维度非 overall 时含分类明细）. */
export function buildTrendTable(
  trend: TrendDataPoint[],
  granularity: TrendGranularity,
  dim: string,
): TrendTableRow[] {
  // 数值模式按周期从近到远降序展示
  const sorted = [...trend].sort((a, b) => (a.period < b.period ? 1 : -1));
  return sorted.map((p) => {
    const dims: { key: string; volumeText: string; unitText: string }[] = [];
    if (p.dim_breakdown) {
      Object.keys(p.dim_breakdown).forEach((key) => {
        const b = p.dim_breakdown?.[key];
        const volume = b && typeof b.volume === "number" ? b.volume : 0;
        const unit = b && typeof b.avg_unit_price === "number" ? b.avg_unit_price : null;
        dims.push({
          key,
          volumeText: formatThousands(volume),
          unitText: unit === null ? "—" : formatThousands(Math.round(unit)),
        });
      });
    }
    return {
      period: formatPeriodLabel(p.period, granularity),
      volumeText: formatThousands(p.volume),
      volumeQoq: buildQoqCell(p.volume_qoq),
      avgPriceText: formatInt(p.avg_price_wan),
      priceQoq: buildQoqCell(p.price_qoq),
      unitText: formatInt(p.avg_unit_price),
      dims,
    };
  });
}

/** 分布视图（图表占比条 + 数值表共用）. */
export function buildDistViews(buckets: DistBucketLike[], total: number): DistViewsResult {
  const rows: DistView[] = buckets.map((b) => {
    const pct = total > 0 ? (b.count / total) * 100 : 0;
    return {
      label: b.label,
      countText: formatThousands(b.count),
      pct,
      pctText: `${pct.toFixed(1)}%`,
      avgAreaText: formatInt(b.avg_area),
      avgUnitText: formatInt(b.avg_unit_price),
    };
  });
  return { rows, totalText: formatThousands(total), empty: total <= 0 };
}