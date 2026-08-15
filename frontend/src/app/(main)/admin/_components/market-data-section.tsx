"use client";

import { useState } from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { components } from "@/lib/api-types";
import { formatCount, formatUnitPriceWan, formatTrendPercent } from "@/lib/formatters";

type CommunityMarketStatsResponse = components["schemas"]["CommunityMarketStatsResponse"];

interface MarketDataSectionProps {
  hasCommunityId: boolean;
  isLoading: boolean;
  marketData: CommunityMarketStatsResponse | null;
}

/** 计算数据截止日展示文本：距今 > 7 天时返回"数据截至 X月X日"，否则返回 null。 */
function formatDataAsOfText(dataAsOf: string | null | undefined, now: number): string | null {
  if (!dataAsOf) return null;
  const asOfDate = new Date(dataAsOf);
  const ts = asOfDate.getTime();
  if (Number.isNaN(ts)) return null;
  const daysDiff = Math.floor((now - ts) / (1000 * 60 * 60 * 24));
  if (daysDiff <= 7) return null;
  return `成交数据截至 ${asOfDate.getMonth() + 1}月${asOfDate.getDate()}日`;
}

export function MarketDataSection({
  hasCommunityId,
  isLoading,
  marketData,
}: MarketDataSectionProps) {
  // 当前时间戳：仅组件挂载时获取一次，避免 render 中调用 Date.now()（impure）。
  const [now] = useState(() => Date.now());

  // 数据截止日：仅当非加载态、有数据且距今 > 7 天时展示
  const dataAsOfText = !isLoading ? formatDataAsOfText(marketData?.data_as_of, now) : null;

  // 标题行：左标题 + 右数据截止日（同一行，不增加卡片高度）
  const titleRow = (
    <div className="flex justify-between items-center mb-3">
      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
        市场数据
      </span>
      {dataAsOfText && <span className="text-[10px] text-muted-foreground">{dataAsOfText}</span>}
    </div>
  );

  if (!hasCommunityId) {
    return (
      <div>
        {titleRow}
        <div className="flex items-center justify-center min-h-17.5 text-xs text-muted-foreground bg-muted rounded-lg">
          未关联小区，暂无数据
        </div>
      </div>
    );
  }

  if (!isLoading && !marketData) {
    return (
      <div>
        {titleRow}
        <div className="flex items-center justify-center min-h-17.5 text-xs text-muted-foreground bg-muted rounded-lg">
          暂无市场数据
        </div>
      </div>
    );
  }

  const onSaleCount = marketData?.on_sale ?? 0;
  // API 返回的 avg_price 单位是元/㎡，转换为万元/㎡ 显示 (/10000)
  const avgPriceWan = formatUnitPriceWan(
    marketData?.avg_price != null ? marketData.avg_price / 10000 : null,
  );
  const volume30d = marketData?.volume_30d ?? 0;
  const priceTrend30d = marketData?.price_trend_30d ?? 0;
  const isPriceUp = marketData?.is_price_up ?? null;
  const priceTrendText = formatTrendPercent(priceTrend30d);

  return (
    <div>
      {titleRow}
      <div className="grid grid-cols-2 gap-3 min-h-17.5">
        <div className="space-y-0.5">
          <p className="text-[10px] text-muted-foreground">竞品在售</p>
          <p className="text-sm font-bold tabular-nums">
            {isLoading ? "-" : `${formatCount(onSaleCount)} 套`}
          </p>
        </div>
        <div className="space-y-0.5 text-right">
          <p className="text-[10px] text-muted-foreground">成交均价</p>
          <p className="text-sm font-bold tabular-nums">{isLoading ? "-" : avgPriceWan}</p>
        </div>
        <div className="space-y-0.5">
          <p className="text-[10px] text-muted-foreground">30日成交</p>
          <p className="text-sm font-bold tabular-nums">
            {isLoading ? "-" : `${formatCount(volume30d)} 套`}
          </p>
        </div>
        <div className="space-y-0.5 text-right">
          <p className="text-[10px] text-muted-foreground">30日趋势</p>
          <p
            className={`text-sm font-bold flex items-center justify-end gap-1 tabular-nums ${
              isPriceUp === true
                ? "text-primary"
                : isPriceUp === false
                  ? "text-error"
                  : "text-muted-foreground"
            }`}
          >
            {isPriceUp === true ? (
              <TrendingUp className="w-3 h-3" aria-hidden="true" />
            ) : isPriceUp === false ? (
              <TrendingDown className="w-3 h-3" aria-hidden="true" />
            ) : (
              <Minus className="w-3 h-3" aria-hidden="true" />
            )}
            {isLoading ? "-" : priceTrendText}
            <span className="sr-only">
              {isPriceUp === true ? "上涨" : isPriceUp === false ? "下跌" : "持平"}
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}
