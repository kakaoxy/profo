"use client";

import { useMemo } from "react";
import { Eye, Wallet } from "lucide-react";
import { getWeekViewStats, getOfferStats, type ApiSalesRecord } from "./project-card-utils";

interface ProjectStatsSectionProps {
  salesRecords: ApiSalesRecord[];
}

export function ProjectStatsSection({ salesRecords }: ProjectStatsSectionProps) {
  const viewingRecords = useMemo(
    () => salesRecords.filter(r => r.record_type === "viewing"),
    [salesRecords]
  );
  const offerRecords = useMemo(
    () => salesRecords.filter(r => r.record_type === "offer"),
    [salesRecords]
  );

  const viewTotal = viewingRecords.length;
  const { currentWeekViews, lastWeekViews } = getWeekViewStats(viewingRecords);
  const viewTrendIsUp = currentWeekViews >= lastWeekViews;

  const { offerCount, maxOffer, lastOffer } = getOfferStats(offerRecords);

  return (
    <div className="space-y-3 min-h-[140px]">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <Eye className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">带看总量</span>
        </div>
        <span className="text-sm font-bold">
          {viewTotal} 次
        </span>
      </div>
      <div className="flex justify-between items-center">
        <div className="text-xs text-muted-foreground ml-6">本周/上周</div>
        <div
          className={`text-xs font-semibold ${
            viewTrendIsUp ? "text-tertiary" : "text-error"
          }`}
        >
          {currentWeekViews} / {lastWeekViews}
          <span className="ml-1">
            {viewTrendIsUp ? "↑" : "↓"}
          </span>
        </div>
      </div>
      <div className="flex justify-between items-center border-t border-border pt-2">
        <div className="flex items-center gap-2">
          <Wallet className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">收到出价</span>
        </div>
        <span className="text-sm font-bold">
          {offerCount} 个
        </span>
      </div>

      <div className="bg-muted p-2 rounded-lg space-y-1 h-12 flex flex-col justify-center">
        {offerCount > 0 ? (
          <>
            <div className="flex justify-between">
              <span className="text-[10px] text-muted-foreground">最高出价 Max</span>
              <span className="text-[10px] font-bold text-primary">
                ¥ {maxOffer}万
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[10px] text-muted-foreground">最后出价 Last</span>
              <span className="text-[10px] font-bold text-on-surface">
                ¥ {lastOffer}万
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
