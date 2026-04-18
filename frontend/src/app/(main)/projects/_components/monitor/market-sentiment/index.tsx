"use client";

import { SectionHeader } from "../section-header";
import { StatsCard } from "./stats-card";
import { useSentimentData } from "./use-sentiment-data";

interface MarketSentimentProps {
  projectId?: string;
  communityName?: string;
}

export function MarketSentiment({
  projectId,
  communityName,
}: MarketSentimentProps) {
  const { floorStats, inventoryMonths, loading, error } = useSentimentData({
    projectId,
    communityName,
  });

  const pressureLabel =
    inventoryMonths > 6
      ? "滞销 (买方市场)"
      : inventoryMonths > 3
        ? "正常"
        : "热销 (卖方市场)";
  const pressureColor =
    inventoryMonths > 6
      ? "text-rose-600"
      : inventoryMonths > 3
        ? "text-amber-600"
        : "text-emerald-600";
  const pressureIcon =
    inventoryMonths > 6 ? "🔴" : inventoryMonths > 3 ? "🟡" : "🟢";

  if (loading) {
    return (
      <section className="mt-8 pb-10">
        <SectionHeader
          index="1"
          title="宏观风向标 (本小区行情)"
          subtitle="Market Sentiment"
        />
        <div className="px-4 sm:px-6 grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="p-5 rounded-xl border border-slate-100 bg-slate-50/50 h-48 animate-pulse"
            />
          ))}
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="mt-8 pb-10">
        <SectionHeader
          index="1"
          title="宏观风向标 (本小区行情)"
          subtitle="Market Sentiment"
        />
        <div className="px-6 text-center py-8">
          <p className="text-sm text-rose-500">{error}</p>
        </div>
      </section>
    );
  }

  return (
    <section className="mt-8 pb-10">
      <SectionHeader
        index="1"
        title="宏观风向标 (本小区行情)"
        subtitle="Market Sentiment"
      />

      <div className="px-4 sm:px-6 grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        <StatsCard
          title="同户型成交统计"
          subtitle="过去12个月"
          stats={floorStats}
          dataKey="deal"
        />

        <StatsCard
          title="同户型挂牌统计"
          subtitle="当前在售"
          stats={floorStats}
          dataKey="current"
        />

        <div className="p-5 rounded-xl border border-slate-100 bg-slate-50/50 flex flex-col">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
            去化压力 (库存/月销)
          </p>
          <div className="mt-2 flex flex-col justify-center grow pb-6">
            <p className="text-3xl font-black text-slate-900">
              {inventoryMonths.toFixed(1)} 个月
            </p>
            <p className={`text-sm font-bold ${pressureColor} mt-2`}>
              {pressureIcon} {pressureLabel}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
