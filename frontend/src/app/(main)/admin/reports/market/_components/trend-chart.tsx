"use client";

import dynamic from "next/dynamic";
import { useQueryState, parseAsString } from "nuqs";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  formatAvgPriceWan,
  formatCount,
  formatPeriod,
  formatQoq,
  formatUnitPriceYuan,
} from "../../_lib/formatters";
import type { Granularity, TrendDataPoint } from "../../_lib/types";

// 动态加载 recharts 渲染器：ssr: false，确保 recharts 仅在客户端以单一 chunk 加载
const TrendChartRenderer = dynamic(() => import("./trend-chart-renderer"), {
  ssr: false,
  loading: () => <Skeleton className="h-[300px] w-full" />,
});

/** 趋势维度选项（与后端 TrendDimension 对齐） */
const DIMENSION_OPTIONS = [
  { value: "overall", label: "综合" },
  { value: "rooms", label: "户型" },
  { value: "floor", label: "楼层" },
  { value: "price", label: "价格段" },
] as const;

/** 维度值类型 */
type DimensionValue = (typeof DIMENSION_OPTIONS)[number]["value"];

interface TrendChartProps {
  data: TrendDataPoint[];
  granularity: Granularity;
  /** 当前维度，由父组件从 URL `trend_dim` 解析后传入 */
  dimension: DimensionValue;
}

export function TrendChart({ data, granularity, dimension }: TrendChartProps) {
  const [trendView, setTrendView] = useQueryState(
    "trend_view",
    parseAsString.withDefault("chart"),
  );
  // 维度切换：shallow: false 触发 Server Component 重新拉取 trend 数据
  const [, setTrendDim] = useQueryState(
    "trend_dim",
    parseAsString.withDefault("overall").withOptions({ shallow: false }),
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>成交趋势图</CardTitle>
        <CardAction>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Label className="text-xs font-medium text-muted-foreground whitespace-nowrap">
                维度
              </Label>
              <ToggleGroup
                type="single"
                value={dimension}
                onValueChange={(v) => {
                  if (v) void setTrendDim(v);
                }}
                variant="outline"
                size="sm"
                className="flex items-center gap-1.5"
              >
                {DIMENSION_OPTIONS.map((opt) => (
                  <ToggleGroupItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant={trendView === "chart" ? "default" : "ghost"}
                size="sm"
                onClick={() => setTrendView("chart")}
              >
                图表
              </Button>
              <Button
                variant={trendView === "table" ? "default" : "ghost"}
                size="sm"
                onClick={() => setTrendView("table")}
              >
                数值
              </Button>
            </div>
          </div>
        </CardAction>
      </CardHeader>
      <CardContent>
        {trendView === "chart" ? (
          <TrendChartRenderer
            data={data}
            granularity={granularity}
            dimension={dimension}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>周期</TableHead>
                <TableHead className="text-right">成交套数</TableHead>
                <TableHead className="text-right">量环比</TableHead>
                <TableHead className="text-right">均价(万)</TableHead>
                <TableHead className="text-right">价环比</TableHead>
                <TableHead className="text-right">单价(元/㎡)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((point) => {
                const volumeQoq = formatQoq(point.volume_qoq);
                const priceQoq = formatQoq(point.price_qoq);
                return (
                  <TableRow key={point.period}>
                    <TableCell>
                      {formatPeriod(point.period, granularity)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCount(point.volume)}
                    </TableCell>
                    <TableCell className="text-right">{volumeQoq.text}</TableCell>
                    <TableCell className="text-right">
                      {formatAvgPriceWan(point.avg_price_wan)}
                    </TableCell>
                    <TableCell className="text-right">{priceQoq.text}</TableCell>
                    <TableCell className="text-right">
                      {formatUnitPriceYuan(point.avg_unit_price)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
