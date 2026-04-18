// src/app/(main)/projects/[projectId]/cashflow/_components/trend-chart.tsx
"use client";

import { useMemo } from "react";
import dynamic from "next/dynamic";
import { format, parseISO } from "date-fns";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CashFlowRecord } from "../types";

// 动态导入 Recharts 组件，减少初始包大小
const ResponsiveContainer = dynamic(
  () => import("recharts").then((mod) => mod.ResponsiveContainer),
  { ssr: false, loading: () => <Skeleton className="h-[250px] w-full" /> }
);
const BarChart = dynamic(() => import("recharts").then((mod) => mod.BarChart), {
  ssr: false,
});
const Bar = dynamic(() => import("recharts").then((mod) => mod.Bar), {
  ssr: false,
});
const XAxis = dynamic(() => import("recharts").then((mod) => mod.XAxis), {
  ssr: false,
});
const YAxis = dynamic(() => import("recharts").then((mod) => mod.YAxis), {
  ssr: false,
});
const CartesianGrid = dynamic(
  () => import("recharts").then((mod) => mod.CartesianGrid),
  { ssr: false }
);
const Tooltip = dynamic(() => import("recharts").then((mod) => mod.Tooltip), {
  ssr: false,
});
const ReferenceLine = dynamic(
  () => import("recharts").then((mod) => mod.ReferenceLine),
  { ssr: false }
);

interface TrendChartProps {
  data: CashFlowRecord[];
}

const COLOR_INCOME = "#ef4444"; // red-500
const COLOR_EXPENSE = "#10b981"; // emerald-500

export function TrendChart({ data }: TrendChartProps) {
  // 数据预处理：按日期聚合
  const chartData = useMemo(() => {
    const grouped = data.reduce((acc, curr) => {
      // 过滤掉没有日期的记录
      if (!curr.date) return acc;
      
      const dateKey = format(parseISO(curr.date), "yyyy-MM-dd");
      if (!acc[dateKey]) {
        acc[dateKey] = { date: dateKey, income: 0, expense: 0 };
      }
      if (curr.type === "income") {
        acc[dateKey].income += curr.amount;
      } else {
        // 支出显示为负数
        acc[dateKey].expense -= curr.amount;
      }
      return acc;
    }, {} as Record<string, { date: string; income: number; expense: number }>);

    // 排序
    return Object.values(grouped).sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );
  }, [data]);

  return (
    <Card className="shadow-none border-0 bg-transparent">
      <CardHeader className="px-0 pt-0 pb-4">
        <CardTitle className="text-sm font-medium text-slate-600">
          资金流向趋势
        </CardTitle>
      </CardHeader>
      <CardContent className="px-0 pl-0 h-[250px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              vertical={false}
              stroke="#e2e8f0"
            />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10, fill: "#64748b" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(val) => format(parseISO(val), "MM-dd")}
            />
            <YAxis
              tick={{ fontSize: 10, fill: "#64748b" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(val) => `¥${Math.abs(val) / 10000}w`}
            />
            <Tooltip
              cursor={{ fill: "#f1f5f9" }}
              contentStyle={{
                borderRadius: "8px",
                border: "none",
                boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
              }}
              formatter={(value) => {
                // ValueType 可能是 string | number | readonly (string | number)[]
                // 我们只处理数值情况
                const numericValue = typeof value === 'number' ? value : 
                                    typeof value === 'string' ? parseFloat(value) : 0;
                const val = Number.isNaN(numericValue) ? 0 : numericValue;
                return [
                  `¥${Math.abs(val).toLocaleString()}`,
                  val > 0 ? "收入" : "支出",
                ];
              }}
            />
            <ReferenceLine y={0} stroke="#94a3b8" />
            <Bar
              dataKey="income"
              fill={COLOR_INCOME}
              radius={[4, 4, 0, 0]}
              maxBarSize={40}
              label={{
                position: "top",
                fill: COLOR_INCOME,
                fontSize: 10,
                formatter: (value) =>
                  typeof value === "number" && value !== 0
                    ? `¥${value.toLocaleString()}`
                    : "", // ← 0 或非数字时返回空字符串，Recharts 会自动隐藏标签
              }}
            />

            <Bar
              dataKey="expense"
              fill={COLOR_EXPENSE}
              radius={[0, 0, 4, 4]}
              maxBarSize={40}
              label={{
                position: "bottom",
                fill: COLOR_EXPENSE,
                fontSize: 10,
                formatter: (value) =>
                  typeof value === "number" && value !== 0
                    ? `¥${Math.abs(value).toLocaleString()}`
                    : "",
              }}
            />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
