"use client";

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

interface PriceChartProps {
  data: TrendData[];
  myPricing: number;
  priceRange: PriceRange;
}

export function PriceChart({ data, myPricing, priceRange }: PriceChartProps) {
  return (
    <div className="h-[400px] w-full mt-4">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data}>
          <CartesianGrid
            strokeDasharray="3 3"
            vertical={false}
            stroke="#f1f5f9"
          />
          <XAxis
            dataKey="month"
            axisLine={false}
            tickLine={false}
            tick={{ fill: "#94a3b8", fontSize: 12 }}
          />
          <YAxis
            yAxisId="left"
            orientation="left"
            axisLine={false}
            tickLine={false}
            tick={{ fill: "#94a3b8", fontSize: 12 }}
            domain={[priceRange.min, priceRange.max]}
            label={{
              value: "单价 (元/㎡)",
              angle: -90,
              position: "insideLeft",
              style: { fill: "#94a3b8", fontSize: 12 },
            }}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            axisLine={false}
            tickLine={false}
            tick={{ fill: "#94a3b8", fontSize: 12 }}
            domain={[0, "auto"]}
            label={{
              value: "成交量 (套)",
              angle: 90,
              position: "insideRight",
              style: { fill: "#94a3b8", fontSize: 12 },
            }}
          />
          <Tooltip
            contentStyle={{
              borderRadius: "12px",
              border: "none",
              boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
            }}
            cursor={{ stroke: "#e2e8f0", strokeWidth: 1 }}
          />
          <Legend verticalAlign="top" height={36} iconType="circle" />

          <Bar
            yAxisId="right"
            dataKey="volume"
            name="成交量"
            fill="#e2e8f0"
            radius={[4, 4, 0, 0]}
            barSize={40}
          />
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="listing_price"
            name="小区挂牌均价"
            stroke="#6366f1"
            strokeWidth={3}
            dot={{
              r: 4,
              fill: "#6366f1",
              strokeWidth: 2,
              stroke: "#fff",
            }}
          />
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="deal_price"
            name="小区成交均价"
            stroke="#10b981"
            strokeWidth={3}
            dot={{
              r: 4,
              fill: "#10b981",
              strokeWidth: 2,
              stroke: "#fff",
            }}
          />

          {myPricing > 0 && (
            <ReferenceLine
              yAxisId="left"
              y={myPricing}
              stroke="#ef4444"
              strokeDasharray="5 5"
              strokeWidth={2}
            >
              <Label
                value={`我的定价: ${Math.round(myPricing / 1000)}k`}
                position="right"
                fill="#ef4444"
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
