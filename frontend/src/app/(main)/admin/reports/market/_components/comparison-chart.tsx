"use client";

/**
 * 多商圈对比图表卡片（Client Component）。
 *
 * 在同一 Card 内提供 "图表 / 数值" 切换：
 * - 图表视图：动态加载 recharts 渲染器（ssr:false，单一 chunk）
 * - 数值视图：纯 Table 渲染，结构与图表数据对齐
 *
 * URL 状态：每种图表使用独立 query param（vol_view / price_view2 /
 * floor_view / room_view），避免与 Level 1 商圈总览的 price_view 冲突。
 */
import dynamic from "next/dynamic";
import { useQueryState, parseAsString } from "nuqs";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatAvgPriceWan, formatCount, formatPercent, formatPeriod } from "../../_lib/formatters";
import type { ComparisonData, ComparisonTrendPoint, Granularity } from "../../_lib/types";

// 动态加载 recharts 渲染器：ssr: false，确保 recharts 仅在客户端以单一 chunk 加载
const ComparisonChartRenderer = dynamic(() => import("./comparison-chart-renderer"), {
  ssr: false,
  loading: () => <Skeleton className="h-[300px] w-full" />,
});

type ChartType = "volume" | "price" | "floor" | "room";

/** 不同图表的 URL query param 名（避免与 Level 1 price_view 冲突） */
const VIEW_PARAM: Record<ChartType, string> = {
  volume: "vol_view",
  price: "price_view2",
  floor: "floor_view",
  room: "room_view",
};

const CHART_TITLE: Record<ChartType, string> = {
  volume: "成交量对比",
  price: "均价对比",
  floor: "楼层结构对比",
  room: "户型结构对比",
};

interface ComparisonChartProps {
  type: ChartType;
  data: ComparisonData;
  granularity: Granularity;
}

/** 从 ComparisonTrendPoint 提取数值（period 字段过滤掉） */
function getTrendValue(point: ComparisonTrendPoint, key: string): number | null {
  const v = point[key];
  return typeof v === "number" ? v : null;
}

interface TrendTableProps {
  data: ComparisonTrendPoint[];
  businessCircles: string[];
  granularity: Granularity;
  format: (v: number | null) => string;
}

function TrendTable({ data, businessCircles, granularity, format }: TrendTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>周期</TableHead>
          {businessCircles.map((bc) => (
            <TableHead key={bc} className="text-right">
              {bc}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((point) => (
          <TableRow key={point.period}>
            <TableCell>{formatPeriod(point.period, granularity)}</TableCell>
            {businessCircles.map((bc) => (
              <TableCell key={bc} className="text-right tabular-nums">
                {format(getTrendValue(point, bc))}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function FloorTable({ data }: { data: ComparisonData["floor_structure"] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>商圈</TableHead>
          <TableHead className="text-right">低楼层</TableHead>
          <TableHead className="text-right">中楼层</TableHead>
          <TableHead className="text-right">高楼层</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((row) => {
          const total = row.low + row.mid + row.high;
          return (
            <TableRow key={row.business_circle}>
              <TableCell>{row.business_circle}</TableCell>
              <TableCell className="text-right tabular-nums">
                {formatCount(row.low)} · {formatPercent(total > 0 ? (row.low / total) * 100 : 0)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatCount(row.mid)} · {formatPercent(total > 0 ? (row.mid / total) * 100 : 0)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatCount(row.high)} · {formatPercent(total > 0 ? (row.high / total) * 100 : 0)}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function RoomTable({ data }: { data: ComparisonData["room_structure"] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>商圈</TableHead>
          <TableHead className="text-right">1室</TableHead>
          <TableHead className="text-right">2室</TableHead>
          <TableHead className="text-right">3室</TableHead>
          <TableHead className="text-right">4室+</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((row) => {
          const total = row.r1 + row.r2 + row.r3 + row.r4plus;
          return (
            <TableRow key={row.business_circle}>
              <TableCell>{row.business_circle}</TableCell>
              <TableCell className="text-right tabular-nums">
                {formatCount(row.r1)} · {formatPercent(total > 0 ? (row.r1 / total) * 100 : 0)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatCount(row.r2)} · {formatPercent(total > 0 ? (row.r2 / total) * 100 : 0)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatCount(row.r3)} · {formatPercent(total > 0 ? (row.r3 / total) * 100 : 0)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatCount(row.r4plus)} ·{" "}
                {formatPercent(total > 0 ? (row.r4plus / total) * 100 : 0)}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function TableView({
  type,
  data,
  granularity,
}: {
  type: ChartType;
  data: ComparisonData;
  granularity: Granularity;
}) {
  if (type === "volume") {
    return (
      <TrendTable
        data={data.volume_trend}
        businessCircles={data.business_circles}
        granularity={granularity}
        format={(v) => formatCount(v ?? 0)}
      />
    );
  }
  if (type === "price") {
    return (
      <TrendTable
        data={data.price_trend}
        businessCircles={data.business_circles}
        granularity={granularity}
        format={formatAvgPriceWan}
      />
    );
  }
  if (type === "floor") {
    return <FloorTable data={data.floor_structure} />;
  }
  return <RoomTable data={data.room_structure} />;
}

export function ComparisonChart({ type, data, granularity }: ComparisonChartProps) {
  const param = VIEW_PARAM[type];
  const [view, setView] = useQueryState(param, parseAsString.withDefault("chart"));

  return (
    <Card>
      <CardHeader>
        <CardTitle>{CHART_TITLE[type]}</CardTitle>
        <CardAction>
          <div className="flex items-center gap-1">
            <Button
              variant={view === "chart" ? "default" : "ghost"}
              size="sm"
              onClick={() => setView("chart")}
            >
              图表
            </Button>
            <Button
              variant={view === "table" ? "default" : "ghost"}
              size="sm"
              onClick={() => setView("table")}
            >
              数值
            </Button>
          </div>
        </CardAction>
      </CardHeader>
      <CardContent>
        {view === "chart" ? (
          <ComparisonChartRenderer type={type} data={data} granularity={granularity} />
        ) : (
          <TableView type={type} data={data} granularity={granularity} />
        )}
      </CardContent>
    </Card>
  );
}
