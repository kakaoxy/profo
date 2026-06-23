"use client";

import { useMemo } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  Label,
} from "recharts";
import type { TrendData } from "../../../actions/monitor-lib/types";
import type { PriceRange } from "./chart-config";
import { getChartColors } from "@/lib/chart-colors";

interface PriceChartProps {
  data: TrendData[];
  myPricing: number;
  priceRange: PriceRange;
}

export function PriceChart({ data, myPricing, priceRange }: PriceChartProps) {
  const colors = useMemo(() => getChartColors(), []);

  return (
    <div className="h-[400px] w-full mt-4">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data}>
          <CartesianGrid
            strokeDasharray="3 3"
            vertical={false}
            stroke={colors.gridSubtle}
          />
          <XAxis
            dataKey="month"
            axisLine={false}
            tickLine={false}
            tick={{ fill: colors.label, fontSize: 12 }}
          />
          <YAxis
            yAxisId="left"
            orientation="left"
            axisLine={false}
            tickLine={false}
            tick={{ fill: colors.label, fontSize: 12 }}
            domain={[priceRange.min, priceRange.max]}
            label={{
              value: "单价 (元/㎡)",
              angle: -90,
              position: "insideLeft",
              style: { fill: colors.label, fontSize: 12 },
            }}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            axisLine={false}
            tickLine={false}
            tick={{ fill: colors.label, fontSize: 12 }}
            domain={[0, "auto"]}
            label={{
              value: "成交量 (套)",
              angle: 90,
              position: "insideRight",
              style: { fill: colors.label, fontSize: 12 },
            }}
          />
          <Tooltip
            contentStyle={{
              borderRadius: "12px",
              border: "none",
              boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
            }}
            cursor={{ stroke: colors.cursor, strokeWidth: 1 }}
          />
          <Legend verticalAlign="top" height={36} iconType="circle" />

          <Bar
            yAxisId="right"
            dataKey="volume"
            name="成交量"
            fill={colors.barBg}
            radius={[4, 4, 0, 0]}
            barSize={40}
          />
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="listing_price"
            name="小区挂牌均价"
            stroke={colors.linePrimary}
            strokeWidth={3}
            dot={{
              r: 4,
              fill: colors.linePrimary,
              strokeWidth: 2,
              stroke: colors.white,
            }}
          />
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="deal_price"
            name="小区成交均价"
            stroke={colors.lineSecondary}
            strokeWidth={3}
            dot={{
              r: 4,
              fill: colors.lineSecondary,
              strokeWidth: 2,
              stroke: colors.white,
            }}
          />

          {myPricing > 0 && (
            <ReferenceLine
              yAxisId="left"
              y={myPricing}
              stroke={colors.negative}
              strokeDasharray="5 5"
              strokeWidth={2}
            >
              <Label
                value={`我的定价: ${Math.round(myPricing / 1000)}k`}
                position="right"
                fill={colors.negative}
                fontSize={12}
                fontWeight="bold"
                offset={10}
              />
            </ReferenceLine>
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
