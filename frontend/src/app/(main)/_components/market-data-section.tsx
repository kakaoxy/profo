"use client";

import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { components } from "@/lib/api-types";

type CommunityMarketStatsResponse = components["schemas"]["CommunityMarketStatsResponse"];

interface MarketDataSectionProps {
  hasCommunityId: boolean;
  isLoading: boolean;
  marketData: CommunityMarketStatsResponse | null;
}

export function MarketDataSection({
  hasCommunityId,
  isLoading,
  marketData,
}: MarketDataSectionProps) {
  if (!hasCommunityId) {
    return (
      <div className="flex items-center justify-center min-h-[70px] text-xs text-slate-400 bg-slate-50 rounded-lg">
        未关联小区，暂无数据
      </div>
    );
  }

  const onSaleCount = marketData?.on_sale ?? 0;
  // API 返回的 avg_price 单位是元/㎡，转换为万元/㎡ 显示 (/10000)
  const avgPriceWan = marketData?.avg_price
    ? (marketData.avg_price / 10000).toFixed(1)
    : "-";
  const volume30d = marketData?.volume_30d ?? 0;
  const priceTrend30d = marketData?.price_trend_30d ?? 0;
  const isPriceUp = marketData?.is_price_up ?? null;
  const priceTrendText =
    priceTrend30d > 0
      ? `+${priceTrend30d.toFixed(1)}%`
      : `${priceTrend30d.toFixed(1)}%`;

  return (
    <div className="grid grid-cols-2 gap-3 min-h-[70px]">
      <div className="space-y-0.5">
        <p className="text-[10px] text-slate-400">竞品在售</p>
        <p className="text-sm font-bold">
          {isLoading ? "-" : `${onSaleCount} 套`}
        </p>
      </div>
      <div className="space-y-0.5">
        <p className="text-[10px] text-slate-400">成交均价</p>
        <p className="text-sm font-bold">
          {isLoading ? "-" : `${avgPriceWan}万/㎡`}
        </p>
      </div>
      <div className="space-y-0.5">
        <p className="text-[10px] text-slate-400">30日成交</p>
        <p className="text-sm font-bold">
          {isLoading ? "-" : `${volume30d} 套`}
        </p>
      </div>
      <div className="space-y-0.5">
        <p className="text-[10px] text-slate-400">30日趋势</p>
        <p
          className={`text-sm font-bold flex items-center gap-1 ${
            isPriceUp === true
              ? "text-primary"
              : isPriceUp === false
              ? "text-error"
              : "text-slate-400"
          }`}
        >
          {isPriceUp === true ? (
            <TrendingUp className="w-3 h-3" />
          ) : isPriceUp === false ? (
            <TrendingDown className="w-3 h-3" />
          ) : (
            <Minus className="w-3 h-3" />
          )}
          {isLoading ? "-" : priceTrendText}
        </p>
      </div>
    </div>
  );
}
