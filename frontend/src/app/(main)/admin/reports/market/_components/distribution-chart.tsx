"use client";

import dynamic from "next/dynamic";
import { parseAsString, useQueryState } from "nuqs";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import {
  formatAreaSqm,
  formatCount,
  formatPercent,
  formatUnitPriceYuan,
} from "../../_lib/formatters";
import type { DistributionBucket } from "../../_lib/types";

// 动态加载 recharts 渲染器：ssr: false，确保 recharts 仅在客户端以单一 chunk 加载
const DistributionRenderer = dynamic(
  () => import("./distribution-renderer"),
  {
    ssr: false,
    loading: () => <Skeleton className="h-[300px] w-full" />,
  },
);

interface DistributionChartProps {
  /** 卡片标题，如 "成交价格分布图" / "户型分布图" / "楼层分布图" */
  title: string;
  /** 数值表格首列表头，如 "价格区间(万)" / "户型" / "楼层" */
  bucketLabelHeader: string;
  buckets: DistributionBucket[];
  total: number;
  /** URL state key，如 "price_view" / "rooms_view" / "floor_view" */
  viewKey: string;
}

export function DistributionChart({
  title,
  bucketLabelHeader,
  buckets,
  total,
  viewKey,
}: DistributionChartProps) {
  const [view, setView] = useQueryState(
    viewKey,
    parseAsString.withDefault("chart"),
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
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
          <DistributionRenderer buckets={buckets} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{bucketLabelHeader}</TableHead>
                <TableHead className="text-right">套数</TableHead>
                <TableHead className="text-right">占比</TableHead>
                <TableHead className="text-right">均面积(㎡)</TableHead>
                <TableHead className="text-right">均单价(元/㎡)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {buckets.map((bucket) => (
                <TableRow key={bucket.label}>
                  <TableCell>{bucket.label}</TableCell>
                  <TableCell className="text-right">
                    {formatCount(bucket.count)}
                  </TableCell>
                  <TableCell className="text-right">
                    {total > 0
                      ? formatPercent((bucket.count / total) * 100)
                      : "0.0%"}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatAreaSqm(bucket.avg_area)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatUnitPriceYuan(bucket.avg_unit_price)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
