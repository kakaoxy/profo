/**
 * 报表页 KPI 卡片组件。
 *
 * 接收聚合好的 KpiData 作为 props，渲染 4 张 KPI 卡片：
 * 成交套数 / 平均成交价 / 平均单价 / 在售房源。
 * 顶部小标签，中部大数值（tabular-nums），底部环比指示器（图标+百分比）。
 *
 * variant='community' 时第 4 张卡片切换为「主力户型」（无环比，显示 —）。
 *
 * Server Component，无需 'use client'。
 */
import { Card, CardContent } from "@/components/ui/card";
import { Minus, TrendingDown, TrendingUp } from "lucide-react";
import type { ReactElement } from "react";
import {
  formatAvgPriceWan,
  formatCount,
  formatQoq,
  formatUnitPriceYuan,
} from "../../_lib/formatters";
import type { KpiCard, KpiData, QoqDirection } from "../../_lib/types";

interface KpiCardsProps {
  data: KpiData;
  /** 'market'(默认) 第4卡=在售房源；'community' 第4卡=主力户型 */
  variant?: "market" | "community";
  /** variant='community' 时第 4 卡显示的主力户型文案 */
  mainLayout?: string | null;
}

type KpiKey = "sold_count" | "avg_price_wan" | "avg_unit_price" | "on_sale_count";

interface CardConfig {
  key: KpiKey;
  label: string;
  /** 格式化主值；sold_count/on_sale_count 的 null 视为 0 */
  format: (value: number | null) => string;
}

const CARDS: readonly CardConfig[] = [
  {
    key: "sold_count",
    label: "成交套数",
    format: (v) => `${formatCount(v ?? 0)} 套`,
  },
  {
    key: "avg_price_wan",
    label: "平均成交价",
    format: (v) => formatAvgPriceWan(v),
  },
  {
    key: "avg_unit_price",
    label: "平均单价",
    format: (v) => formatUnitPriceYuan(v),
  },
  {
    key: "on_sale_count",
    label: "在售房源",
    format: (v) => `${formatCount(v ?? 0)} 套`,
  },
];

/** 环比方向 → 文本颜色（涨红跌绿，持平/未知灰；遵循中国股市习惯） */
function qoqColorClass(direction: QoqDirection): string {
  switch (direction) {
    case "up":
      return "text-money-positive";
    case "down":
      return "text-money-negative";
    default:
      return "text-muted-foreground";
  }
}

/** 环比方向 → 箭头图标 */
function QoqIcon({ direction }: { direction: QoqDirection }): ReactElement {
  const className = "w-3 h-3";
  if (direction === "up") return <TrendingUp className={className} aria-hidden="true" />;
  if (direction === "down") return <TrendingDown className={className} aria-hidden="true" />;
  return <Minus className={className} aria-hidden="true" />;
}

function QoqIndicator({ card }: { card: KpiCard }): ReactElement {
  const { text, direction } = formatQoq(card.qoq);
  const colorClass = qoqColorClass(direction);
  const srText = direction === "up" ? "上涨" : direction === "down" ? "下跌" : "持平";
  return (
    <p
      className={`flex items-center gap-1 text-xs font-medium tabular-nums ${colorClass}`}
    >
      <QoqIcon direction={direction} />
      <span>{text}</span>
      <span className="sr-only">{srText}</span>
    </p>
  );
}

export function KpiCards({
  data,
  variant = "market",
  mainLayout,
}: KpiCardsProps): ReactElement {
  // community 变体下，前 3 张卡片复用，第 4 张切换为「主力户型」
  const cards = variant === "community" ? CARDS.slice(0, 3) : CARDS;
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {cards.map((cfg) => {
        const card = data[cfg.key];
        return (
          <Card
            key={cfg.key}
            className="p-4 bg-card border-border shadow-sm transition-colors hover:bg-muted/50"
          >
            <CardContent className="px-0 space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground truncate">
                {cfg.label}
              </p>
              <p className="text-xl font-bold text-foreground tabular-nums">
                {cfg.format(card.value)}
              </p>
              <QoqIndicator card={card} />
            </CardContent>
          </Card>
        );
      })}
      {variant === "community" && (
        <Card className="p-4 bg-card border-border shadow-sm transition-colors hover:bg-muted/50">
          <CardContent className="px-0 space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground truncate">
              主力户型
            </p>
            <p className="text-xl font-bold text-foreground">{mainLayout ?? "-"}</p>
            <p className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
              <Minus className="w-3 h-3" aria-hidden="true" />
              <span>&mdash;</span>
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
