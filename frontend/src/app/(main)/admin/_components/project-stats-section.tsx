"use client";

import { useMemo } from "react";
import { Eye, Wallet } from "lucide-react";
import { getWeekViewStats, getOfferStats, type ApiSalesRecord } from "./project-card-utils";
import { formatCnyWan, formatCount } from "@/lib/formatters";

interface ProjectStatsSectionProps {
  salesRecords: ApiSalesRecord[];
}

export function ProjectStatsSection({ salesRecords }: ProjectStatsSectionProps) {
  const viewingRecords = useMemo(
    () => salesRecords.filter((r) => r.record_type === "viewing"),
    [salesRecords],
  );
  const offerRecords = useMemo(
    () => salesRecords.filter((r) => r.record_type === "offer"),
    [salesRecords],
  );

  const viewTotal = viewingRecords.length;
  const { currentWeekViews, lastWeekViews } = getWeekViewStats(viewingRecords);
  const viewTrendIsUp = currentWeekViews > lastWeekViews;
  const viewTrendIsFlat = currentWeekViews === lastWeekViews;

  const { offerCount, maxOffer, lastOffer } = getOfferStats(offerRecords);

  return (
    <div className="space-y-3 min-h-[140px]">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <Eye className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
          <span className="text-sm text-muted-foreground">带看总量</span>
        </div>
        <span className="text-sm font-bold tabular-nums">{formatCount(viewTotal)} 次</span>
      </div>
      <div className="flex justify-between items-center">
        <div className="text-xs text-muted-foreground ml-6">本周/上周</div>
        <div
          className={`text-xs font-semibold tabular-nums ${
            viewTrendIsFlat
              ? "text-muted-foreground"
              : viewTrendIsUp
                ? "text-tertiary"
                : "text-error"
          }`}
        >
          {formatCount(currentWeekViews)} / {formatCount(lastWeekViews)}
          <span className="ml-1" aria-hidden="true">
            {viewTrendIsFlat ? "→" : viewTrendIsUp ? "↑" : "↓"}
          </span>
          <span className="sr-only">
            {viewTrendIsFlat ? "持平" : viewTrendIsUp ? "上升" : "下降"}
          </span>
        </div>
      </div>
      <div className="flex justify-between items-center border-t border-border pt-2">
        <div className="flex items-center gap-2">
          <Wallet className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
          <span className="text-sm text-muted-foreground">收到出价</span>
        </div>
        <span className="text-sm font-bold tabular-nums">{formatCount(offerCount)} 个</span>
      </div>

      <div className="bg-muted p-2 rounded-lg space-y-1 h-12 flex flex-col justify-center">
        {offerCount > 0 ? (
          <>
            <div className="flex justify-between">
              <span className="text-[10px] text-muted-foreground">最高出价 Max</span>
              <span className="text-[10px] font-bold text-primary tabular-nums">
                {formatCnyWan(maxOffer)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[10px] text-muted-foreground">最后出价 Last</span>
              <span className="text-[10px] font-bold text-on-surface tabular-nums">
                {formatCnyWan(lastOffer)}
              </span>
            </div>
          </>
        ) : (
          <div className="flex justify-center text-[10px] text-muted-foreground">
            暂无出价 No Offers
          </div>
        )}
      </div>
    </div>
  );
}
