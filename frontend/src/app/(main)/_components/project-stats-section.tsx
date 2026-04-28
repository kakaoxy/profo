"use client";

import { Eye, Wallet } from "lucide-react";
import { getWeekViewStats, getOfferStats } from "./project-card-utils";

type ApiSalesRecord = {
  id: string;
  record_type: string;
  price?: string | null;
  record_date: string;
  customer_name?: string | null;
  notes?: string | null;
};

interface ProjectStatsSectionProps {
  salesRecords: ApiSalesRecord[];
}

export function ProjectStatsSection({ salesRecords }: ProjectStatsSectionProps) {
  const viewingRecords = salesRecords.filter(r => r.record_type === "viewing");
  const offerRecords = salesRecords.filter(r => r.record_type === "offer");

  const viewTotal = viewingRecords.length;
  const { currentWeekViews, lastWeekViews } = getWeekViewStats(viewingRecords);
  const viewTrendIsUp = currentWeekViews >= lastWeekViews;

  const { offerCount, maxOffer, lastOffer } = getOfferStats(offerRecords);

  return (
    <div className="space-y-3 min-h-[140px]">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <Eye className="w-4 h-4 text-slate-400" />
          <span className="text-sm text-slate-600">带看总量</span>
        </div>
        <span className="text-sm font-bold">
          {viewTotal} 次
        </span>
      </div>
      <div className="flex justify-between items-center">
        <div className="text-xs text-slate-500 ml-6">本周/上周</div>
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
      <div className="flex justify-between items-center border-t border-slate-50 pt-2">
        <div className="flex items-center gap-2">
          <Wallet className="w-4 h-4 text-slate-400" />
          <span className="text-sm text-slate-600">收到出价</span>
        </div>
        <span className="text-sm font-bold">
          {offerCount} 个
        </span>
      </div>

      <div className="bg-slate-50 p-2 rounded-lg space-y-1 h-12 flex flex-col justify-center">
        {offerCount > 0 ? (
          <>
            <div className="flex justify-between">
              <span className="text-[10px] text-slate-400">最高出价 Max</span>
              <span className="text-[10px] font-bold text-primary">
                ¥ {maxOffer}万
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[10px] text-slate-400">最后出价 Last</span>
              <span className="text-[10px] font-bold text-on-surface">
                ¥ {lastOffer}万
              </span>
            </div>
          </>
        ) : (
          <div className="flex justify-center text-[10px] text-slate-400">
            暂无出价 No Offers
          </div>
        )}
      </div>
    </div>
  );
}
