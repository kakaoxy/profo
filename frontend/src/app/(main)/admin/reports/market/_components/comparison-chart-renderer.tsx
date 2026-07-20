"use client";

/**
 * 多商圈对比图表渲染器（recharts，由父组件 next/dynamic({ ssr:false }) 加载）。
 *
 * - volume: 分组柱状图，X=周期，系列=各商圈成交量
 * - price:  多折线图，X=周期，系列=各商圈均价(万)
 * - floor:  百分比堆叠柱状图，X=商圈，系列=低/中/高楼层
 * - room:   百分比堆叠柱状图，X=商圈，系列=1室/2室/3室/4室+
 *
 * 注：price_trend 实际承载 avg_price_wan（非单价），
 * 故 Y 轴标签与 Tooltip 一律按 "均价(万)" 展示。
 */
import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useChartColors } from "@/lib/chart-colors";
import { computeYAxisDomain } from "../../_lib/chart-utils";
import {
  formatAvgPriceWan,
  formatCount,
  formatPercent,
  formatPeriod,
} from "../../_lib/formatters";
import type { ComparisonData, Granularity } from "../../_lib/types";

type ChartType = "volume" | "price" | "floor" | "room";

interface ComparisonChartRendererProps {
  type: ChartType;
  data: ComparisonData;
  granularity: Granularity;
}

/** 多商圈系列配色（与单色 trend chart 区分，便于辨识多系列） */
const SERIES_COLOR_PALETTE = [
  "#6366f1", // indigo
  "#10b981", // emerald
  "#f59e0b", // amber
  "#ef4444", // red
  "#8b5cf6", // violet
  "#06b6d4", // cyan
  "#ec4899", // pink
];

const FLOOR_SERIES: { key: "low" | "mid" | "high"; label: string }[] = [
  { key: "low", label: "低楼层" },
  { key: "mid", label: "中楼层" },
  { key: "high", label: "高楼层" },
];

const ROOM_SERIES: {
  key: "r1" | "r2" | "r3" | "r4plus";
  label: string;
}[] = [
  { key: "r1", label: "1室" },
  { key: "r2", label: "2室" },
  { key: "r3", label: "3室" },
  { key: "r4plus", label: "4室+" },
];

function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const n = parseFloat(value);
    return Number.isNaN(n) ? 0 : n;
  }
  return 0;
}

function getStackTotal(
  payload: Record<string, unknown> | undefined,
  keys: string[],
): number {
  if (!payload) return 0;
  return keys.reduce((sum, k) => sum + toNumber(payload[k]), 0);
}

const TOOLTIP_STYLE = {
  borderRadius: "12px",
  border: "none",
  boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
} as const;

export default function ComparisonChartRenderer({
  type,
  data,
  granularity,
}: ComparisonChartRendererProps) {
  const colors = useChartColors();

  // volume/price 类型 Y 轴 domain：[min*0.8, max*1.05]；floor/room 保持 [0, 1] 不变
  const volumeDomain = useMemo(
    () =>
      computeYAxisDomain(
        data.volume_trend.flatMap((p) =>
          data.business_circles.map(
            (bc) => p[bc] as number | null | undefined,
          ),
        ),
      ),
    [data],
  );
  const priceDomain = useMemo(
    () =>
      computeYAxisDomain(
        data.price_trend.flatMap((p) =>
          data.business_circles.map(
            (bc) => p[bc] as number | null | undefined,
          ),
        ),
      ),
    [data],
  );

  // ─── Volume: 分组柱状图 ───────────────────────────────────────────────
  if (type === "volume") {
    return (
      <ResponsiveContainer width="100%" height={300}>
        <BarChart
          data={data.volume_trend}
          margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            vertical={false}
            stroke={colors.gridSubtle}
          />
          <XAxis
            dataKey="period"
            tickFormatter={(p: string) => formatPeriod(p, granularity)}
            axisLine={false}
            tickLine={false}
            tick={{ fill: colors.label, fontSize: 12 }}
          />
          <YAxis
            domain={volumeDomain}
            allowDecimals={false}
            axisLine={false}
            tickLine={false}
            tick={{ fill: colors.label, fontSize: 12 }}
          />
          <Tooltip
            cursor={{ fill: colors.gridSubtle }}
            contentStyle={TOOLTIP_STYLE}
            formatter={(value, name) => [
              formatCount(toNumber(value)),
              String(name),
            ]}
            labelFormatter={(label) =>
              formatPeriod(String(label), granularity)
            }
          />
          <Legend verticalAlign="top" height={36} iconType="circle" />
          {data.business_circles.map((bc, idx) => (
            <Bar
              key={bc}
              dataKey={bc}
              name={bc}
              fill={SERIES_COLOR_PALETTE[idx % SERIES_COLOR_PALETTE.length]}
              radius={[4, 4, 0, 0]}
              maxBarSize={32}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    );
  }

  // ─── Price: 多折线图 ───────────────────────────────────────────────────
  if (type === "price") {
    return (
      <ResponsiveContainer width="100%" height={300}>
        <LineChart
          data={data.price_trend}
          margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            vertical={false}
            stroke={colors.gridSubtle}
          />
          <XAxis
            dataKey="period"
            tickFormatter={(p: string) => formatPeriod(p, granularity)}
            axisLine={false}
            tickLine={false}
            tick={{ fill: colors.label, fontSize: 12 }}
          />
          <YAxis
            domain={priceDomain}
            axisLine={false}
            tickLine={false}
            tick={{ fill: colors.label, fontSize: 12 }}
            label={{
              value: "均价(万)",
              angle: -90,
              position: "insideLeft",
              style: { fill: colors.label, fontSize: 12 },
            }}
          />
          <Tooltip
            cursor={{ stroke: colors.cursor, strokeWidth: 1 }}
            contentStyle={TOOLTIP_STYLE}
            formatter={(value, name) => {
              const num = toNumber(value);
              return [formatAvgPriceWan(num === 0 ? null : num), String(name)];
            }}
            labelFormatter={(label) =>
              formatPeriod(String(label), granularity)
            }
          />
          <Legend verticalAlign="top" height={36} iconType="circle" />
          {data.business_circles.map((bc, idx) => (
            <Line
              key={bc}
              type="monotone"
              dataKey={bc}
              name={bc}
              stroke={SERIES_COLOR_PALETTE[idx % SERIES_COLOR_PALETTE.length]}
              strokeWidth={2}
              dot={{ r: 3 }}
              connectNulls={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    );
  }

  // ─── Floor: 百分比堆叠柱状图 ───────────────────────────────────────────
  if (type === "floor") {
    const keys = FLOOR_SERIES.map((s) => s.key);
    return (
      <ResponsiveContainer width="100%" height={300}>
        <BarChart
          data={data.floor_structure}
          margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
          stackOffset="expand"
        >
          <CartesianGrid
            strokeDasharray="3 3"
            vertical={false}
            stroke={colors.gridSubtle}
          />
          <XAxis
            dataKey="business_circle"
            axisLine={false}
            tickLine={false}
            tick={{ fill: colors.label, fontSize: 12 }}
          />
          <YAxis
            domain={[0, 1]}
            axisLine={false}
            tickLine={false}
            tick={{ fill: colors.label, fontSize: 12 }}
            tickFormatter={(v: number) => formatPercent(v * 100)}
          />
          <Tooltip
            cursor={{ fill: colors.gridSubtle }}
            contentStyle={TOOLTIP_STYLE}
            formatter={(value, name, item) => {
              const payload = (
                item as { payload?: Record<string, unknown> }
              )?.payload;
              const total = getStackTotal(payload, keys);
              const num = toNumber(value);
              const pct = total > 0 ? (num / total) * 100 : 0;
              return [`${formatCount(num)} · ${formatPercent(pct)}`, String(name)];
            }}
          />
          <Legend verticalAlign="top" height={36} iconType="circle" />
          {FLOOR_SERIES.map((s, idx) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label}
              stackId="floor"
              fill={SERIES_COLOR_PALETTE[idx % SERIES_COLOR_PALETTE.length]}
              maxBarSize={48}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    );
  }

  // ─── Room: 百分比堆叠柱状图 ────────────────────────────────────────────
  const roomKeys = ROOM_SERIES.map((s) => s.key);
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart
        data={data.room_structure}
        margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
        stackOffset="expand"
      >
        <CartesianGrid
          strokeDasharray="3 3"
          vertical={false}
          stroke={colors.gridSubtle}
        />
        <XAxis
          dataKey="business_circle"
          axisLine={false}
          tickLine={false}
          tick={{ fill: colors.label, fontSize: 12 }}
        />
        <YAxis
          domain={[0, 1]}
          axisLine={false}
          tickLine={false}
          tick={{ fill: colors.label, fontSize: 12 }}
          tickFormatter={(v: number) => formatPercent(v * 100)}
        />
        <Tooltip
          cursor={{ fill: colors.gridSubtle }}
          contentStyle={TOOLTIP_STYLE}
          formatter={(value, name, item) => {
            const payload = (
              item as { payload?: Record<string, unknown> }
            )?.payload;
            const total = getStackTotal(payload, roomKeys);
            const num = toNumber(value);
            const pct = total > 0 ? (num / total) * 100 : 0;
            return [`${formatCount(num)} · ${formatPercent(pct)}`, String(name)];
          }}
        />
        <Legend verticalAlign="top" height={36} iconType="circle" />
        {ROOM_SERIES.map((s, idx) => (
          <Bar
            key={s.key}
            dataKey={s.key}
            name={s.label}
            stackId="room"
            fill={SERIES_COLOR_PALETTE[idx % SERIES_COLOR_PALETTE.length]}
            maxBarSize={48}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
