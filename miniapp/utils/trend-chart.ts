/**
 * 成交趋势图轻量绘制工具（canvas 2d 纯函数）.
 * 页面持有 canvas 节点，本模块只负责数据整形与绘制，不依赖页面状态.
 */

import type { components } from "../types/api-types";

/** 趋势粒度. */
export type TrendGranularity = "week" | "month";

type TrendDataPoint = components["schemas"]["TrendDataPoint"];

/** 折线系列（overall 一条均价线；rooms/floor 每个分类一条）. */
export interface TrendLine {
  key: string;
  values: (number | null)[];
}

/** 图表数据. */
export interface TrendChartData {
  labels: string[];
  volumes: number[];
  lines: TrendLine[];
}

/** 图例项（WXML 渲染用）. */
export interface TrendLegendItem {
  label: string;
  color: string;
}

/** 暖色系统颜色（对齐设计稿 token 的近似 rgba）. */
export const TREND_BAR_COLOR = "rgba(203, 192, 170, 0.85)";
export const TREND_AXIS_COLOR = "rgb(151, 131, 101)";
export const TREND_GRID_COLOR = "rgba(60, 50, 40, 0.08)";
export const TREND_LINE_PALETTE = [
  "rgb(184, 66, 30)",
  "rgb(93, 133, 176)",
  "rgb(96, 150, 118)",
  "rgb(178, 130, 70)",
  "rgb(140, 108, 180)",
  "rgb(150, 150, 150)",
];

/** 由 range 推导趋势粒度：4w/8w 为周，其余为月. */
export function granularityFromRange(range: string): TrendGranularity {
  return range === "4w" || range === "8w" ? "week" : "month";
}

/** 周期标签：周粒度 W28，月粒度 2026-07. */
export function formatPeriodLabel(period: string, granularity: TrendGranularity): string {
  const d = new Date(`${period}T00:00:00`);
  if (Number.isNaN(d.getTime())) {
    return period;
  }
  if (granularity === "week") {
    return `W${isoWeek(d)}`;
  }
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

/** ISO 8601 周数. */
function isoWeek(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

/** 构造图表数据：后端已补 0；折线空值保留 null（断线）. */
export function buildTrendChartData(
  points: TrendDataPoint[],
  granularity: TrendGranularity,
  dimension: string,
): TrendChartData {
  const labels = points.map((p) => formatPeriodLabel(p.period, granularity));
  const volumes = points.map((p) => p.volume);
  if (dimension === "overall") {
    return {
      labels,
      volumes,
      lines: [{ key: "均价(元/㎡)", values: points.map((p) => p.avg_unit_price ?? null) }],
    };
  }
  const keys: string[] = [];
  points.forEach((p) => {
    if (!p.dim_breakdown) return;
    Object.keys(p.dim_breakdown).forEach((k) => {
      if (!keys.includes(k)) keys.push(k);
    });
  });
  const lines = keys.map((key) => ({
    key,
    values: points.map((p) => {
      const b = p.dim_breakdown?.[key];
      if (!b) return null;
      const v = b.avg_unit_price;
      return typeof v === "number" && Number.isFinite(v) ? v : null;
    }),
  }));
  return { labels, volumes, lines };
}

/** 图例：成交套数 + 各折线. */
export function buildTrendLegend(chartData: TrendChartData): TrendLegendItem[] {
  const items: TrendLegendItem[] = [{ label: "成交套数", color: TREND_BAR_COLOR }];
  chartData.lines.forEach((line, i) => {
    items.push({
      label: line.key,
      color: TREND_LINE_PALETTE[i % TREND_LINE_PALETTE.length],
    });
  });
  return items;
}

/** 绘制组合图：柱=成交套数，折线=均价/分类单价. */
export function drawTrendChart(
  ctx: WechatMiniprogram.CanvasRenderingContext.CanvasRenderingContext2D,
  width: number,
  height: number,
  data: TrendChartData,
): void {
  const pad = { left: 6, right: 6, top: 12, bottom: 20 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const n = data.labels.length;
  if (plotW <= 0 || plotH <= 0 || n === 0) return;

  const maxVolume = Math.max(1, ...data.volumes);
  const barSlot = plotW / n;
  const barW = Math.max(2, Math.min(22, barSlot * 0.6));
  const barBottom = pad.top + plotH;

  // 折线值域（含内外边距）
  const lineValues: number[] = [];
  data.lines.forEach((l) => l.values.forEach((v) => v !== null && lineValues.push(v)));
  let lineMin = 0;
  let lineMax = 1;
  if (lineValues.length > 0) {
    lineMin = Math.min(...lineValues);
    lineMax = Math.max(...lineValues);
    if (lineMax - lineMin < 1) {
      lineMin -= 0.5;
      lineMax += 0.5;
    } else {
      const span = lineMax - lineMin;
      lineMin -= span * 0.15;
      lineMax += span * 0.15;
    }
  }

  ctx.clearRect(0, 0, width, height);

  // 横向网格
  ctx.strokeStyle = TREND_GRID_COLOR;
  ctx.lineWidth = 1;
  for (let g = 0; g < 4; g++) {
    const y = pad.top + (plotH * g) / 3;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(width - pad.right, y);
    ctx.stroke();
  }

  // 柱
  ctx.fillStyle = TREND_BAR_COLOR;
  data.volumes.forEach((v, i) => {
    const h = (v / maxVolume) * plotH;
    const x = pad.left + barSlot * i + (barSlot - barW) / 2;
    roundTopBar(ctx, x, barBottom - Math.max(h, 0), barW, Math.max(h, v > 0 ? 2 : 0), 3);
  });

  const xAt = (i: number) => pad.left + barSlot * i + barSlot / 2;
  const yAt = (v: number) => pad.top + plotH - ((v - lineMin) / (lineMax - lineMin)) * plotH;

  // 折线
  data.lines.forEach((line, li) => {
    const color = TREND_LINE_PALETTE[li % TREND_LINE_PALETTE.length];
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    let started = false;
    line.values.forEach((v, i) => {
      if (v === null) {
        started = false;
        return;
      }
      const x = xAt(i);
      const y = yAt(v);
      if (started) {
        ctx.lineTo(x, y);
      } else {
        ctx.moveTo(x, y);
        started = true;
      }
    });
    ctx.stroke();
    // 数据点
    line.values.forEach((v, i) => {
      if (v === null) return;
      const x = xAt(i);
      const y = yAt(v);
      ctx.beginPath();
      ctx.arc(x, y, 2.6, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.6;
      ctx.stroke();
    });
  });

  // X 轴标签（首/中/尾，最多 4 个）
  ctx.fillStyle = TREND_AXIS_COLOR;
  ctx.font = "9px sans-serif";
  ctx.textAlign = "center";
  pickLabelIndices(n).forEach((i) => {
    ctx.fillText(data.labels[i], xAt(i), height - 6);
  });
}

/** 顶部圆角柱体. */
function roundTopBar(
  ctx: WechatMiniprogram.CanvasRenderingContext.CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.max(0, Math.min(r, w / 2, h));
  ctx.beginPath();
  ctx.moveTo(x, y + h);
  ctx.lineTo(x, y + rr);
  ctx.arcTo(x, y, x + rr, y, rr);
  ctx.lineTo(x + w - rr, y);
  ctx.arcTo(x + w, y, x + w, y + rr, rr);
  ctx.lineTo(x + w, y + h);
  ctx.closePath();
  ctx.fill();
}

/** 均匀取样轴标签索引（首尾必取）. */
function pickLabelIndices(n: number): number[] {
  if (n <= 4) {
    return Array.from({ length: n }, (_, i) => i);
  }
  const step = Math.ceil(n / 4);
  const idx: number[] = [];
  for (let i = 0; i < n; i += step) {
    idx.push(i);
  }
  if (idx[idx.length - 1] !== n - 1) {
    idx.push(n - 1);
  }
  return idx;
}
