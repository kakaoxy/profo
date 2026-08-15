// src/app/(main)/admin/ledger/[projectId]/_components/trend-chart.tsx
"use client";

import { useMemo } from "react";
import dynamic from "next/dynamic";
import { safeFormatDate } from "@/lib/formatters";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { components } from "@/lib/api-types";
import { getChartColors } from "@/lib/chart-colors";
import type { ChartDataPoint } from "./chart-renderer";

type CashFlowRecord = components["schemas"]["CashFlowRecordResponse"];

// 单一动态导入：将所有 recharts 组件打包到同一 chunk，客户端按需加载（ssr: false）
const ChartRenderer = dynamic(() => import("./chart-renderer"), {
  ssr: false,
  loading: () => <Skeleton className="h-[250px] w-full" />,
});

interface TrendChartProps {
  data: CashFlowRecord[];
}

export function TrendChart({ data }: TrendChartProps) {
  const colors = useMemo(() => getChartColors(), []);

  // 数据预处理：按日期聚合
  const chartData = useMemo<ChartDataPoint[]>(() => {
    const grouped = data.reduce(
      (acc, curr) => {
        // 过滤掉没有日期的记录
        if (!curr.date) return acc;

        const dateKey = safeFormatDate(curr.date, "yyyy-MM-dd");
        if (dateKey === "-") return acc;
        if (!acc[dateKey]) {
          acc[dateKey] = {
            date: dateKey,
            income: 0,
            expense: 0,
            // 预计算时间戳，避免 sort 比较时重复构造 Date 对象
            timestamp: new Date(dateKey).getTime(),
          };
        }
        if (curr.type === "income") {
          acc[dateKey].income += curr.amount;
        } else {
          // 支出显示为负数
          acc[dateKey].expense -= curr.amount;
        }
        return acc;
      },
      {} as Record<string, ChartDataPoint>,
    );

    // 排序：直接比较预计算的数字时间戳
    return Object.values(grouped).sort((a, b) => a.timestamp - b.timestamp);
  }, [data]);

  const COLOR_INCOME = colors.positive;
  const COLOR_EXPENSE = colors.negative;

  return (
    <Card className="shadow-none border-0 bg-transparent">
      <CardHeader className="px-0 pt-0 pb-4">
        <CardTitle className="text-sm font-medium text-muted-foreground">资金流向趋势</CardTitle>
      </CardHeader>
      <CardContent className="px-0 pl-0 h-[250px]">
        <ChartRenderer
          chartData={chartData}
          colors={colors}
          colorIncome={COLOR_INCOME}
          colorExpense={COLOR_EXPENSE}
        />
      </CardContent>
    </Card>
  );
}
