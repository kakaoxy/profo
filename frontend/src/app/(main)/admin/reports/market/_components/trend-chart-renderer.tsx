"use client";

import { useMemo } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useChartColors } from "@/lib/chart-colors";
import { computeYAxisDomain } from "../../_lib/chart-utils";
import { formatCount, formatPeriod, formatUnitPriceYuan } from "../../_lib/formatters";
import type { Granularity, TrendDataPoint } from "../../_lib/types";

/** 维度下钻折线色板（与单条主折线颜色区分） */
const DIM_COLOR_PALETTE = [
  "#ef4444", // red-500
  "#10b981", // emerald-500
  "#f59e0b", // amber-500
  "#3b82f6", // blue-500
  "#8b5cf6", // violet-500
  "#ec4899", // pink-500
  "#14b8a6", // teal-500
  "#f97316", // orange-500
];

/** 趋势维度类型，与后端 TrendDimension 对齐 */
export type TrendDimension = "overall" | "rooms" | "floor" | "price";

interface TrendChartRendererProps {
  data: TrendDataPoint[];
  granularity: Granularity;
  /** 当前维度；overall 显示主单价折线，其他维度显示分类单价折线 */
  dimension: TrendDimension;
}

/**
 * 趋势图渲染器：由父组件通过 next/dynamic({ ssr: false }) 加载。
 *
 * 左 Y 轴=成交套数（柱状），右 Y 轴=单价元/㎡（折线）。
 * - dimension === "overall"：展示主单价折线（一条）
 * - dimension !== "overall"：展示多条分类单价折线（每个 dim_breakdown 键一条），不展示主单价折线
 */
export default function TrendChartRenderer({
  data,
  granularity,
  dimension,
}: TrendChartRendererProps) {
  const colors = useChartColors();

  // 拍平为 recharts 可读行：period / volume / avg_unit_price + 各 dim_breakdown 键
  // 收集所有 dim_breakdown 键（顺序稳定，按首次出现顺序）
  const { flatData, dimKeys } = useMemo(() => {
    const keys: string[] = [];
    const seen = new Set<string>();
    data.forEach((point) => {
      if (!point.dim_breakdown) return;
      Object.keys(point.dim_breakdown).forEach((k) => {
        if (!seen.has(k)) {
          seen.add(k);
          keys.push(k);
        }
      });
    });
    return {
      flatData: data.map((point) => {
        const row: Record<string, number | string | null> = {
          period: point.period,
          volume: point.volume,
          avg_unit_price: point.avg_unit_price,
        };
        keys.forEach((k) => {
          const breakdown = point.dim_breakdown?.[k];
          row[k] = breakdown?.avg_unit_price ?? null;
        });
        return row;
      }),
      dimKeys: keys,
    };
  }, [data]);

  const hasBreakdown = dimension !== "overall" && dimKeys.length > 0;

  // 左 Y 轴（成交量）domain：[min*0.8, max*1.05]，含 0 值时退化为 0 基线
  const leftDomain = useMemo(() => computeYAxisDomain(data.map((d) => d.volume)), [data]);

  // 右 Y 轴（单价）domain：
  // - 综合维度：基于 avg_unit_price
  // - 其他维度：合并所有分类 avg_unit_price 计算 domain
  const rightDomain = useMemo(() => {
    if (!hasBreakdown) {
      return computeYAxisDomain(data.map((d) => d.avg_unit_price));
    }
    const allValues: (number | null)[] = [];
    data.forEach((point) => {
      if (!point.dim_breakdown) return;
      Object.values(point.dim_breakdown).forEach((v) => {
        if (v?.avg_unit_price !== null && v?.avg_unit_price !== undefined) {
          allValues.push(v.avg_unit_price);
        }
      });
    });
    return computeYAxisDomain(allValues);
  }, [data, hasBreakdown]);

  return (
    <ResponsiveContainer width="100%" height={300}>
      <ComposedChart data={flatData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={colors.gridSubtle} />
        <XAxis
          dataKey="period"
          tickFormatter={(p: string) => formatPeriod(p, granularity)}
          axisLine={false}
          tickLine={false}
          tick={{ fill: colors.label, fontSize: 12 }}
        />
        <YAxis
          yAxisId="left"
          orientation="left"
          domain={leftDomain}
          allowDecimals={false}
          axisLine={false}
          tickLine={false}
          tick={{ fill: colors.label, fontSize: 12 }}
          label={{
            value: "成交套数",
            angle: -90,
            position: "insideLeft",
            style: { fill: colors.label, fontSize: 12 },
          }}
        />
        <YAxis
          yAxisId="right"
          orientation="right"
          domain={rightDomain}
          axisLine={false}
          tickLine={false}
          tick={{ fill: colors.label, fontSize: 12 }}
          label={{
            value: "单价(元/㎡)",
            angle: 90,
            position: "insideRight",
            style: { fill: colors.label, fontSize: 12 },
          }}
        />
        <Tooltip
          cursor={{ stroke: colors.cursor, strokeWidth: 1 }}
          contentStyle={{
            borderRadius: "12px",
            border: "none",
            boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
          }}
          formatter={(value, name) => {
            const nameStr = String(name);
            if (value === null || value === undefined) return ["-", nameStr];
            const num =
              typeof value === "number" ? value : typeof value === "string" ? parseFloat(value) : 0;
            const validNum = Number.isNaN(num) ? 0 : num;
            if (nameStr === "成交套数") return [formatCount(validNum), nameStr];
            return [formatUnitPriceYuan(validNum), nameStr];
          }}
          labelFormatter={(label) => formatPeriod(String(label), granularity)}
        />
        <Legend verticalAlign="top" height={36} iconType="circle" />
        <Bar
          yAxisId="left"
          dataKey="volume"
          name="成交套数"
          fill={colors.barBg}
          radius={[4, 4, 0, 0]}
          maxBarSize={48}
        />
        {/* 综合维度：主单价折线 */}
        {!hasBreakdown && (
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="avg_unit_price"
            name="单价(元/㎡)"
            stroke={colors.linePrimary}
            strokeWidth={3}
            dot={{
              r: 4,
              fill: colors.linePrimary,
              strokeWidth: 2,
              stroke: colors.white,
            }}
            connectNulls={false}
          />
        )}
        {/* 户型/楼层/价格段维度：分类单价折线（不展示主单价折线） */}
        {hasBreakdown &&
          dimKeys.map((key, idx) => (
            <Line
              key={key}
              yAxisId="right"
              type="monotone"
              dataKey={key}
              name={key}
              stroke={DIM_COLOR_PALETTE[idx % DIM_COLOR_PALETTE.length]}
              strokeWidth={2}
              dot={{
                r: 3,
                fill: DIM_COLOR_PALETTE[idx % DIM_COLOR_PALETTE.length],
                strokeWidth: 1,
                stroke: colors.white,
              }}
              connectNulls={false}
            />
          ))}
      </ComposedChart>
    </ResponsiveContainer>
  );
}
