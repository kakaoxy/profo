"use client";

import { TrendingDown, TrendingUp } from "lucide-react";
import type { FloorStats } from "../../../actions/monitor-lib/types";

interface StatsCardProps {
  title: string;
  subtitle: string;
  stats: FloorStats[];
  dataKey: "deal" | "current";
}

const FLOOR_TYPE_MAP: Record<string, string> = {
  high: "高楼层",
  mid: "中楼层",
  low: "低楼层",
};

export function StatsCard({ title, subtitle, stats, dataKey }: StatsCardProps) {
  const isDeal = dataKey === "deal";
  const TrendIcon = isDeal ? TrendingDown : TrendingUp;
  const trendColor = isDeal
    ? "bg-rose-50 text-rose-600"
    : "bg-emerald-50 text-emerald-600";

  return (
    <div className="p-5 rounded-xl border border-slate-100 bg-slate-50/50 flex flex-col">
      <div className="flex justify-between items-start mb-4">
        <div>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
            {title}
          </p>
          <p className="text-[10px] text-slate-400 font-medium mt-0.5">
            {subtitle}
          </p>
        </div>
        <div
          className={`flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded ${trendColor}`}
        >
          <TrendIcon size={12} />—
        </div>
      </div>

      <div className="space-y-3 grow">
        {stats.map((item, idx) => {
          const count = isDeal ? item.deals_count : item.current_count;
          const avgPrice = isDeal
            ? item.deal_avg_price
            : item.current_avg_price;
          const colorClass =
            idx === 0
              ? "bg-indigo-500"
              : idx === 1
                ? "bg-blue-400"
                : "bg-slate-300";

          return (
            <div key={`${dataKey}-${item.type}`}>
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className={`w-1 h-8 rounded-full ${colorClass}`} />
                  <div>
                    <p className="text-[10px] text-slate-400 font-medium flex items-center gap-1">
                      {FLOOR_TYPE_MAP[item.type] || item.type}
                      <span className="text-slate-300">|</span>
                      <span className="text-indigo-600 font-bold">
                        {count} 套
                      </span>
                    </p>
                    <p className="text-base font-black text-slate-800">
                      {avgPrice.toFixed(0)} 万
                    </p>
                  </div>
                </div>
              </div>
              {idx < stats.length - 1 && (
                <div className="h-px bg-slate-200/50" />
              )}
            </div>
          );
        })}
        {stats.length === 0 && (
          <p className="text-sm text-slate-400 text-center py-4">暂无数据</p>
        )}
      </div>
    </div>
  );
}
