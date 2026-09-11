/**
 * 报表页 KPI 卡片组件。
 *
 * 复用后台统一 KPI 卡网格 StatCardGrid（Steep 体系）：
 * 接收聚合好的 KpiData 作为 props，渲染 4 张 KPI 卡片：
 * 成交套数 / 平均成交价 / 平均单价 / 在售房源。
 * 顶部小标签，中部大数值（30px / 450 / tabular-nums），底部环比指示器（图标+百分比）。
 *
 * variant='community' 时第 4 张卡片切换为「主力户型」（无环比，显示 —）。
 *
 * Server Component，无需 'use client'。
 */
import { Minus, TrendingDown, TrendingUp } from "lucide-react";
import type { ReactElement } from "react";
import { StatCardGrid, type StatItem } from "@/app/(main)/admin/_components";
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

/** 环比方向 → 趋势色调（涨红跌绿，持平/未知中性；遵循中国股市习惯） */
function qoqTone(direction: QoqDirection): "up" | "down" | "neutral" {
  switch (direction) {
    case "up":
      return "up";
    case "down":
      return "down";
    default:
      return "neutral";
  }
}

/** 环比方向 → 箭头图标 */
function QoqIcon({ direction }: { direction: QoqDirection }): ReactElement {
  const className = "w-3 h-3";
  if (direction === "up") return <TrendingUp className={className} aria-hidden="true" />;
  if (direction === "down") return <TrendingDown className={className} aria-hidden="true" />;
  return <Minus className={className} aria-hidden="true" />;
}

/**
 * 环比指示器（无颜色，颜色由 StatCardGrid 按 tone 统一渲染）。
 * 保留 formatQoq 调用与 sr-only 无障碍文本。
 */
function QoqIndicator({ card }: { card: KpiCard }): ReactElement {
  const { text, direction } = formatQoq(card.qoq);
  const srText = direction === "up" ? "上涨" : direction === "down" ? "下跌" : "持平";
  return (
    <span className="flex items-center gap-1 tabular-nums">
      <QoqIcon direction={direction} />
      <span>{text}</span>
      <span className="sr-only">{srText}</span>
    </span>
  );
}

export function KpiCards({ data, variant = "market", mainLayout }: KpiCardsProps): ReactElement {
  // community 变体下，前 3 张卡片复用，第 4 张切换为「主力户型」
  const cards = variant === "community" ? CARDS.slice(0, 3) : CARDS;

  const items: StatItem[] = cards.map((cfg) => {
    const card = data[cfg.key];
    const { direction } = formatQoq(card.qoq);
    return {
      label: cfg.label,
      value: cfg.format(card.value),
      trend: {
        text: <QoqIndicator card={card} />,
        tone: qoqTone(direction),
      },
    };
  });

  if (variant === "community") {
    items.push({
      label: "主力户型",
      value: mainLayout ?? "-",
      trend: {
        text: (
          <span className="flex items-center gap-1">
            <Minus className="w-3 h-3" aria-hidden="true" />
            <span>—</span>
          </span>
        ),
      },
    });
  }

  return <StatCardGrid items={items} columns={4} />;
}
