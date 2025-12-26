"use client";
// 数据监控 - 宏观风向标 (本小区行情)

import React, { useEffect, useState } from "react";
import { TrendingDown, TrendingUp } from "lucide-react";
import { SectionHeader } from "./section-header";
import { getMarketSentimentAction, getMarketSentimentByCommunityAction, type FloorStats } from "@/app/(main)/projects/actions";

interface MarketSentimentProps {
  projectId?: string;
  communityName?: string;
}

// 楼层类型映射
const FLOOR_TYPE_MAP: Record<string, string> = {
  high: "高楼层",
  mid: "中楼层",
  low: "低楼层",
};

export function MarketSentiment({ projectId, communityName }: MarketSentimentProps) {
  const [floorStats, setFloorStats] = useState<FloorStats[]>([]);
  const [inventoryMonths, setInventoryMonths] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        setError(null);
        
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let result: any;

        if (projectId) {
          result = await getMarketSentimentAction(projectId);
        } else if (communityName) {
          result = await getMarketSentimentByCommunityAction(communityName);
        } else {
          setLoading(false);
          return;
        }

        // console.log("[MarketSentiment] API result:", result);

        if (!result.success) {
          setError(result.message || "获取市场情绪失败");
          return;
        }

        if (result.data) {
          // console.log("[MarketSentiment] floor_stats:", result.data.floor_stats);
          // console.log("[MarketSentiment] inventory_months:", result.data.inventory_months);
          setFloorStats(result.data.floor_stats || []);
          setInventoryMonths(result.data.inventory_months || 0);
        }
      } catch (e) {
        console.error("获取市场情绪异常:", e);
        setError("网络错误，请稍后重试");
      } finally {
        setLoading(false);
      }
    }

    if (projectId || communityName) {
      fetchData();
    }
  }, [projectId, communityName]);

  // 计算去化压力标签
  const pressureLabel = inventoryMonths > 6 ? "滞销 (买方市场)" : inventoryMonths > 3 ? "正常" : "热销 (卖方市场)";
  const pressureColor = inventoryMonths > 6 ? "text-rose-600" : inventoryMonths > 3 ? "text-amber-600" : "text-emerald-600";
  const pressureIcon = inventoryMonths > 6 ? "🔴" : inventoryMonths > 3 ? "🟡" : "🟢";

  // Loading skeleton
  if (loading) {
    return (
      <section className="mt-8 pb-10">
        <SectionHeader index="1" title="宏观风向标 (本小区行情)" subtitle="Market Sentiment" />
        <div className="px-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="p-5 rounded-xl border border-slate-100 bg-slate-50/50 h-48 animate-pulse" />
          ))}
        </div>
      </section>
    );
  }

  // Error state
  if (error) {
    return (
      <section className="mt-8 pb-10">
        <SectionHeader index="1" title="宏观风向标 (本小区行情)" subtitle="Market Sentiment" />
        <div className="px-6 text-center py-8">
          <p className="text-sm text-rose-500">{error}</p>
        </div>
      </section>
    );
  }

  return (
    <section className="mt-8 pb-10">
      <SectionHeader index="1" title="宏观风向标 (本小区行情)" subtitle="Market Sentiment" />
      
      <div className="px-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 成交统计 */}
        <StatsCard title="同户型成交统计" subtitle="过去12个月" stats={floorStats} dataKey="deal" />

        {/* 挂牌统计 */}
        <StatsCard title="同户型挂牌统计" subtitle="当前在售" stats={floorStats} dataKey="current" />

        {/* 去化压力 */}
        <div className="p-5 rounded-xl border border-slate-100 bg-slate-50/50 flex flex-col">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">去化压力 (库存/月销)</p>
          <div className="mt-2 flex flex-col justify-center flex-grow pb-6">
            <p className="text-3xl font-black text-slate-900">{inventoryMonths.toFixed(1)} 个月</p>
            <p className={`text-sm font-bold ${pressureColor} mt-2`}>{pressureIcon} {pressureLabel}</p>
          </div>
        </div>
      </div>
    </section>
  );
}

// 统计卡片子组件
function StatsCard({
  title,
  subtitle,
  stats,
  dataKey,
}: {
  title: string;
  subtitle: string;
  stats: FloorStats[];
  dataKey: "deal" | "current";
}) {
  const isDeal = dataKey === "deal";
  const TrendIcon = isDeal ? TrendingDown : TrendingUp;
  const trendColor = isDeal ? "bg-rose-50 text-rose-600" : "bg-emerald-50 text-emerald-600";

  return (
    <div className="p-5 rounded-xl border border-slate-100 bg-slate-50/50 flex flex-col">
      <div className="flex justify-between items-start mb-4">
        <div>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">{title}</p>
          <p className="text-[10px] text-slate-400 font-medium mt-0.5">{subtitle}</p>
        </div>
        <div className={`flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded ${trendColor}`}>
          <TrendIcon size={12} />
          —
        </div>
      </div>
      
      <div className="space-y-3 flex-grow">
        {stats.map((item, idx) => {
          const count = isDeal ? item.deals_count : item.current_count;
          const avgPrice = isDeal ? item.deal_avg_price : item.current_avg_price;
          const colorClass = idx === 0 ? "bg-indigo-500" : idx === 1 ? "bg-blue-400" : "bg-slate-300";
          
          return (
            <React.Fragment key={`${dataKey}-${item.type}`}>
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className={`w-1 h-8 rounded-full ${colorClass}`} />
                  <div>
                    <p className="text-[10px] text-slate-400 font-medium flex items-center gap-1">
                      {FLOOR_TYPE_MAP[item.type] || item.type}
                      <span className="text-slate-300">|</span>
                      <span className="text-indigo-600 font-bold">{count} 套</span>
                    </p>
                    <p className="text-base font-black text-slate-800">{avgPrice.toFixed(0)} 万</p>
                  </div>
                </div>
              </div>
              {idx < stats.length - 1 && <div className="h-px bg-slate-200/50" />}
            </React.Fragment>
          );
        })}
        {stats.length === 0 && (
          <p className="text-sm text-slate-400 text-center py-4">暂无数据</p>
        )}
      </div>
    </div>
  );
}
