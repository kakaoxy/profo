// src/app/(main)/admin/ledger/[projectId]/_components/chart-renderer.tsx
"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { safeFormatDate } from "@/lib/formatters";
import type { ChartColors } from "@/lib/chart-colors";

// 趋势图数据点（含预计算的时间戳，用于排序）
export interface ChartDataPoint {
  date: string;
  income: number;
  expense: number;
  timestamp: number;
}

interface ChartRendererProps {
  chartData: ChartDataPoint[];
  colors: ChartColors;
  colorIncome: string;
  colorExpense: string;
}

// 图表渲染组件：一次性静态导入所有 recharts 组件，
// 由父组件通过 next/dynamic({ ssr: false }) 加载，确保 recharts 仅在客户端以单一 chunk 加载
function ChartRenderer({
  chartData,
  colors,
  colorIncome,
  colorExpense,
}: ChartRendererProps) {
  // 固定数值高度避免依赖父容器 clientHeight 测量，防止 dynamic 加载切换瞬间测得 0 触发 recharts 宽高 -1 警告
  return (
    <ResponsiveContainer width="100%" height={250}>
      <BarChart
        data={chartData}
        margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
      >
        <CartesianGrid
          strokeDasharray="3 3"
          vertical={false}
          stroke={colors.grid}
        />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 10, fill: colors.label }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(val) => safeFormatDate(val, "MM-dd")}
        />
        <YAxis
          tick={{ fontSize: 10, fill: colors.label }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(val) => `¥${Math.abs(val) / 10000}w`}
        />
        <Tooltip
          cursor={{ fill: colors.gridSubtle }}
          contentStyle={{
            borderRadius: "8px",
            border: "none",
            boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
          }}
          formatter={(value) => {
            // ValueType 可能是 string | number | readonly (string | number)[]
            // 我们只处理数值情况
            const numericValue =
              typeof value === "number"
                ? value
                : typeof value === "string"
                  ? parseFloat(value)
                  : 0;
            const val = Number.isNaN(numericValue) ? 0 : numericValue;
            return [
              `¥${Math.abs(val).toLocaleString()}`,
              val > 0 ? "收入" : "支出",
            ];
          }}
        />
        <ReferenceLine y={0} stroke={colors.label} />
        <Bar
          dataKey="income"
          fill={colorIncome}
          radius={[4, 4, 0, 0]}
          maxBarSize={40}
          label={{
            position: "top",
            fill: colorIncome,
            fontSize: 10,
            formatter: (value) =>
              typeof value === "number" && value !== 0
                ? `¥${value.toLocaleString()}`
                : "", // ← 0 或非数字时返回空字符串，Recharts 会自动隐藏标签
          }}
        />

        <Bar
          dataKey="expense"
          fill={colorExpense}
          radius={[0, 0, 4, 4]}
          maxBarSize={40}
          label={{
            position: "bottom",
            fill: colorExpense,
            fontSize: 10,
            formatter: (value) =>
              typeof value === "number" && value !== 0
                ? `¥${Math.abs(value).toLocaleString()}`
                : "",
          }}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

export default ChartRenderer;
