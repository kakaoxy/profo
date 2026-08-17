"use client";

import { useMemo, useState, useEffect } from "react";
import {
  startOfWeek,
  endOfWeek,
  subWeeks,
  isWithinInterval,
  parseISO,
  isSameWeek,
  isValid,
} from "date-fns";
import { Project, SalesRecord } from "../../../../types";

interface ListingKPIsProps {
  project: Project;
}

export function ListingKPIs({ project }: ListingKPIsProps) {
  // 使用 state 存储 now，避免 SSR 和客户端时间不一致导致的 hydration 错误
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
  }, []);

  const stats = useMemo(() => {
    const records: SalesRecord[] = project.sales_records || [];

    // 1. Data Filtering
    const viewings = records.filter((r) => r.record_type === "viewing");
    const offers = records.filter((r) => r.record_type === "offer");
    const talks = records.filter((r) => r.record_type === "negotiation");

    // 2. Time Range Definition (Week starts on Monday)
    // now 未就绪时返回零值 stats，避免用 fallback 日期算出错误结果
    if (!now) {
      return {
        viewings: { count: 0, growth: 0, isPositive: true, isInfinite: false, lastWeekCount: 0 },
        bids: { count: 0, max: 0 },
        talks: { count: 0, latest: "暂无" },
      };
    }
    const thisWeekStart = startOfWeek(now, { weekStartsOn: 1 });
    const thisWeekEnd = endOfWeek(now, { weekStartsOn: 1 });
    const lastWeekStart = startOfWeek(subWeeks(now, 1), { weekStartsOn: 1 });
    const lastWeekEnd = endOfWeek(subWeeks(now, 1), { weekStartsOn: 1 });

    // 3. Viewings Calculation
    let thisWeekViewingsCount = 0;
    let lastWeekViewingsCount = 0;

    viewings.forEach((record) => {
      const date = parseISO(record.record_date);
      if (!isValid(date)) return;
      if (isWithinInterval(date, { start: thisWeekStart, end: thisWeekEnd })) {
        thisWeekViewingsCount++;
      } else if (isWithinInterval(date, { start: lastWeekStart, end: lastWeekEnd })) {
        lastWeekViewingsCount++;
      }
    });

    // Growth Rate Calculation
    let growthRate = 0;
    let isGrowthPositive = true;
    let isInfinite = false;

    if (lastWeekViewingsCount === 0) {
      if (thisWeekViewingsCount > 0) {
        isInfinite = true; // 0 -> N
      }
    } else {
      growthRate = Math.round(
        ((thisWeekViewingsCount - lastWeekViewingsCount) / lastWeekViewingsCount) * 100,
      );
    }
    isGrowthPositive = growthRate >= 0;

    // 4. Bids Calculation
    let thisWeekBidsCount = 0;
    offers.forEach((record) => {
      const date = parseISO(record.record_date);
      if (!isValid(date)) return;
      if (isWithinInterval(date, { start: thisWeekStart, end: thisWeekEnd })) {
        thisWeekBidsCount++;
      }
    });

    const maxBid = offers.length > 0 ? Math.max(...offers.map((o) => Number(o.price) || 0)) : 0;

    // 5. Talks Calculation
    let thisWeekTalksCount = 0;
    talks.forEach((record) => {
      const date = parseISO(record.record_date);
      if (!isValid(date)) return;
      if (isWithinInterval(date, { start: thisWeekStart, end: thisWeekEnd })) {
        thisWeekTalksCount++;
      }
    });

    // Get latest talk date
    const sortedTalks = [...talks].sort(
      (a, b) => new Date(b.record_date).getTime() - new Date(a.record_date).getTime(),
    );
    const latestTalk = sortedTalks[0];
    let latestTalkText = "暂无";

    if (latestTalk) {
      const date = parseISO(latestTalk.record_date);
      if (isValid(date)) {
        if (isSameWeek(date, now, { weekStartsOn: 1 })) {
          latestTalkText = "本周";
        } else {
          // Format as M.dd（设计稿「最新面谈 10.16」）
          latestTalkText = `${date.getMonth() + 1}.${String(date.getDate()).padStart(2, "0")}`;
        }
      }
    }

    return {
      viewings: {
        count: thisWeekViewingsCount,
        growth: Math.abs(growthRate),
        isPositive: isGrowthPositive,
        isInfinite,
        lastWeekCount: lastWeekViewingsCount,
      },
      bids: {
        count: thisWeekBidsCount,
        max: maxBid,
      },
      talks: {
        count: thisWeekTalksCount,
        latest: latestTalkText,
      },
    };
  }, [project.sales_records, now]);

  return (
    <div className="mb-5 grid grid-cols-1 gap-3 font-sohne sm:grid-cols-3">
      {/* 1. 带看卡片 — 冷底（设计稿 .kpi.cool：无图标、delta 石墨灰） */}
      <div className="rounded-cards bg-sky-wash p-5">
        <div className="text-[13px] font-[450] text-[rgba(23,25,28,0.55)]">本周带看</div>
        <div className="mt-1.5 flex items-baseline gap-1.5">
          <span className="font-signifier text-[30px] font-[480] leading-[1.15] tracking-[-0.02em] text-ink">
            {stats.viewings.count}
          </span>
          <span className="text-sm font-[430] text-graphite">组</span>
        </div>
        <div className="mt-2 text-xs font-[450] text-[rgba(23,25,28,0.55)]">
          {stats.viewings.isInfinite
            ? "新增爆发"
            : `环比上周 ${stats.viewings.isPositive ? "+" : "-"}${stats.viewings.growth}%`}
        </div>
      </div>

      {/* 2. 出价卡片 — 白卡（设计稿 .kpi：shadow-card 白卡、无图标） */}
      <div className="rounded-cards bg-pure-white p-5 shadow-steep">
        <div className="text-[13px] font-[450] text-graphite">本周出价</div>
        <div className="mt-1.5 flex items-baseline gap-1.5">
          <span className="font-signifier text-[30px] font-[480] leading-[1.15] tracking-[-0.02em] text-ink">
            {stats.bids.count}
          </span>
          <span className="text-sm font-[430] text-graphite">笔</span>
        </div>
        <div className="mt-2 text-xs font-[450] text-graphite">
          {stats.bids.max > 0 ? `最高出价 ${stats.bids.max} 万` : "暂无出价"}
        </div>
      </div>

      {/* 3. 面谈卡片 — 暖底（设计稿 .kpi.warm：value Rust、无图标、delta 石墨灰） */}
      <div className="rounded-cards bg-apricot-wash p-5">
        <div className="text-[13px] font-[450] text-[rgba(23,25,28,0.55)]">本周面谈</div>
        <div className="mt-1.5 flex items-baseline gap-1.5">
          <span className="font-signifier text-[30px] font-[480] leading-[1.15] tracking-[-0.02em] text-rust">
            {stats.talks.count}
          </span>
          <span className="text-sm font-[430] text-graphite">场</span>
        </div>
        <div className="mt-2 text-xs font-[450] text-[rgba(23,25,28,0.55)]">
          {stats.talks.latest === "暂无"
            ? "暂无面谈记录"
            : `最新面谈 ${stats.talks.latest} · 沟通纪要已记录`}
        </div>
      </div>
    </div>
  );
}
