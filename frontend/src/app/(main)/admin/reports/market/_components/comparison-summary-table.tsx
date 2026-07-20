/**
 * 多商圈对比 - 指标汇总表（Server Component）。
 *
 * 行=指标，列=商圈；按指标名匹配对应 formatter 渲染数值。
 * 环比行附方向图标与涨跌色（与 KPI 卡片保持一致）。
 */
import type { ReactElement } from "react";
import { Minus, TrendingDown, TrendingUp } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  formatAbsorptionMonths,
  formatAvgPriceWan,
  formatCount,
  formatQoq,
  formatUnitPriceYuan,
} from "../../_lib/formatters";
import type { ComparisonData, QoqDirection } from "../../_lib/types";

interface ComparisonSummaryTableProps {
  data: ComparisonData;
}

const QOQ_COLOR: Record<QoqDirection, string> = {
  up: "text-red-600 dark:text-red-400",
  down: "text-emerald-600 dark:text-emerald-400",
  flat: "text-muted-foreground",
  unknown: "text-muted-foreground",
};

function QoqIcon({ direction }: { direction: QoqDirection }): ReactElement {
  const className = "w-3 h-3 inline";
  if (direction === "up") {
    return <TrendingUp className={className} aria-hidden="true" />;
  }
  if (direction === "down") {
    return <TrendingDown className={className} aria-hidden="true" />;
  }
  return <Minus className={className} aria-hidden="true" />;
}

/**
 * 按 metric 名选择 formatter；环比行附方向图标。
 * 兼容后端实际产出的 "价环比(%)" / "量环比(%)" 写法。
 */
function renderMetricValue(metric: string, value: number | null): ReactElement {
  const base = metric.replace(/\(%\)$/, "");
  switch (base) {
    case "成交套数":
    case "在售房源":
      return <span className="tabular-nums">{formatCount(value ?? 0)}</span>;
    case "均价(万)":
      return <span className="tabular-nums">{formatAvgPriceWan(value)}</span>;
    case "单价(元/㎡)":
      return <span className="tabular-nums">{formatUnitPriceYuan(value)}</span>;
    case "去化周期(月)":
      return <span className="tabular-nums">{formatAbsorptionMonths(value)}</span>;
    case "价环比":
    case "量环比": {
      const qoq = formatQoq(value);
      return (
        <span
          className={`flex items-center justify-end gap-1 tabular-nums ${QOQ_COLOR[qoq.direction]}`}
        >
          <QoqIcon direction={qoq.direction} />
          <span>{qoq.text}</span>
        </span>
      );
    }
    default:
      return <span>{value === null ? "-" : String(value)}</span>;
  }
}

export function ComparisonSummaryTable({
  data,
}: ComparisonSummaryTableProps): ReactElement {
  const { business_circles, summary } = data;
  return (
    <Card>
      <CardHeader>
        <CardTitle>指标汇总</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>指标</TableHead>
              {business_circles.map((bc) => (
                <TableHead key={bc} className="text-right">
                  {bc}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {summary.map((row) => (
              <TableRow key={row.metric}>
                <TableCell className="font-medium">{row.metric}</TableCell>
                {row.values.map((value, i) => (
                  <TableCell key={i} className="text-right">
                    {renderMetricValue(row.metric, value)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
