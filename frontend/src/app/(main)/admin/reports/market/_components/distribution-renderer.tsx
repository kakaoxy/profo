"use client";

import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useChartColors } from "@/lib/chart-colors";
import { computeYAxisDomain } from "../../_lib/chart-utils";
import { formatCount } from "../../_lib/formatters";
import type { DistributionBucket } from "../../_lib/types";

interface DistributionRendererProps {
  buckets: DistributionBucket[];
}

/**
 * 通用分布渲染器：由父组件通过 next/dynamic({ ssr: false }) 加载。
 * 柱状图展示各桶套数，顶部 LabelList 显示具体数值。
 */
export default function DistributionRenderer({ buckets }: DistributionRendererProps) {
  const colors = useChartColors();

  // Y 轴 domain：[min*0.8, max*1.05]，含 0 值时退化为 0 基线
  const yDomain = useMemo(() => computeYAxisDomain(buckets.map((b) => b.count)), [buckets]);

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={buckets} margin={{ top: 20, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={colors.gridSubtle} />
        <XAxis
          dataKey="label"
          axisLine={false}
          tickLine={false}
          tick={{ fill: colors.label, fontSize: 12 }}
        />
        <YAxis
          domain={yDomain}
          axisLine={false}
          tickLine={false}
          tick={{ fill: colors.label, fontSize: 12 }}
          allowDecimals={false}
        />
        <Tooltip
          cursor={{ fill: colors.gridSubtle }}
          contentStyle={{
            borderRadius: "12px",
            border: "none",
            boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
          }}
          formatter={(value) => [
            typeof value === "number" ? formatCount(value) : String(value),
            "套数",
          ]}
        />
        <Legend verticalAlign="top" height={36} iconType="circle" />
        <Bar
          dataKey="count"
          name="套数"
          fill={colors.linePrimary}
          radius={[4, 4, 0, 0]}
          maxBarSize={48}
        >
          <LabelList
            dataKey="count"
            position="top"
            fill={colors.label}
            fontSize={12}
            formatter={(value) =>
              typeof value === "number" && value > 0 ? formatCount(value) : ""
            }
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
