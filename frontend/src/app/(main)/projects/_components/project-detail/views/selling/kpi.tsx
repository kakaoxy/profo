"use client";

import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import {
  Eye,
  Gavel,
  MessageSquare,
  TrendingUp,
  TrendingDown,
  Tag,
  Calendar
} from "lucide-react";
import {
  startOfWeek,
  endOfWeek,
  subWeeks,
  isWithinInterval,
  parseISO,
  isSameWeek,
} from "date-fns";
import { cn } from "@/lib/utils";
import { Project, SalesRecord } from "../../../../types";

interface ListingKPIsProps {
  project: Project;
}

export function ListingKPIs({ project }: ListingKPIsProps) {
  const stats = useMemo(() => {
    const records: SalesRecord[] = project.sales_records || [];

    // 1. Data Filtering
    const viewings = records.filter((r) => r.record_type === "viewing");
    const offers = records.filter((r) => r.record_type === "offer");
    const talks = records.filter((r) => r.record_type === "negotiation");

    // 2. Time Range Definition (Week starts on Monday)
    const now = new Date();
    const thisWeekStart = startOfWeek(now, { weekStartsOn: 1 });
    const thisWeekEnd = endOfWeek(now, { weekStartsOn: 1 });
    const lastWeekStart = startOfWeek(subWeeks(now, 1), { weekStartsOn: 1 });
    const lastWeekEnd = endOfWeek(subWeeks(now, 1), { weekStartsOn: 1 });

    // 3. Viewings Calculation
    let thisWeekViewingsCount = 0;
    let lastWeekViewingsCount = 0;

    viewings.forEach((record) => {
      const date = parseISO(record.record_date);
      if (isWithinInterval(date, { start: thisWeekStart, end: thisWeekEnd })) {
        thisWeekViewingsCount++;
      } else if (
        isWithinInterval(date, { start: lastWeekStart, end: lastWeekEnd })
      ) {
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
        ((thisWeekViewingsCount - lastWeekViewingsCount) /
          lastWeekViewingsCount) *
          100
      );
    }
    isGrowthPositive = growthRate >= 0;

    // 4. Bids Calculation
    let thisWeekBidsCount = 0;
    offers.forEach((record) => {
      const date = parseISO(record.record_date);
      if (isWithinInterval(date, { start: thisWeekStart, end: thisWeekEnd })) {
        thisWeekBidsCount++;
      }
    });

    const maxBid =
      offers.length > 0
        ? Math.max(...offers.map((o) => Number(o.price) || 0))
        : 0;

    // 5. Talks Calculation
    let thisWeekTalksCount = 0;
    talks.forEach((record) => {
      const date = parseISO(record.record_date);
      if (isWithinInterval(date, { start: thisWeekStart, end: thisWeekEnd })) {
        thisWeekTalksCount++;
      }
    });

    // Get latest talk date
    const sortedTalks = [...talks].sort(
      (a, b) =>
        new Date(b.record_date).getTime() - new Date(a.record_date).getTime()
    );
    const latestTalk = sortedTalks[0];
    let latestTalkText = "暂无";

    if (latestTalk) {
      const date = parseISO(latestTalk.record_date);
      if (isSameWeek(date, now, { weekStartsOn: 1 })) {
        latestTalkText = "本周";
      } else {
        // Format as MM-dd
        latestTalkText = `${date.getMonth() + 1}月${date.getDate()}日`;
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
  }, [project.sales_records]);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
      {/* 1. 带看卡片 (蓝色主题 - 活跃) */}
      <Card className="shadow-sm border-blue-100 bg-blue-50/40">
        <CardContent className="p-4 relative">
          <Eye className="absolute top-4 right-4 h-4 w-4 text-blue-500 opacity-50" />
          <div className="text-xs text-blue-600 font-medium">
            本周带看
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900">
              {stats.viewings.count}
            </span>
            <span className="text-xs text-muted-foreground">组</span>
          </div>
          <div
            className={cn(
              "mt-1 flex items-center text-[10px] font-medium",
              stats.viewings.isInfinite || stats.viewings.isPositive
                ? "text-emerald-600"
                : "text-red-600"
            )}
          >
            {stats.viewings.isInfinite ? (
              <>
                <TrendingUp className="h-3 w-3 mr-1" />
                新增爆发
              </>
            ) : (
              <>
                {stats.viewings.isPositive ? (
                  <TrendingUp className="h-3 w-3 mr-1" />
                ) : (
                  <TrendingDown className="h-3 w-3 mr-1" />
                )}
                {stats.viewings.growth}% 较上周
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 2. 出价卡片 (浅灰主题 - 中性) */}
      <Card className="shadow-sm border-slate-200 bg-slate-50/50">
        <CardContent className="p-4 relative">
          <Tag className="absolute top-4 right-4 h-4 w-4 text-slate-400 opacity-50" />
          <div className="text-xs text-slate-600 font-medium">
            本周出价
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900">
              {stats.bids.count}
            </span>
            <span className="text-xs text-muted-foreground">笔</span>
          </div>
          <div className="mt-1 text-[10px] text-muted-foreground flex items-center gap-1">
            <Gavel className="h-3 w-3" />
            最高:{" "}
            <span className="font-bold text-slate-700">
              ¥{stats.bids.max}万
            </span>
          </div>
        </CardContent>
      </Card>

      {/* 3. 面谈卡片 (浅黄主题 - 机会) */}
      <Card className="shadow-sm border-orange-100 bg-orange-50/30">
        <CardContent className="p-4 relative">
          <Calendar className="absolute top-4 right-4 h-4 w-4 text-orange-400 opacity-50" />
          <div className="text-xs text-orange-600 font-medium">
            本周面谈
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900">
              {stats.talks.count}
            </span>
            <span className="text-xs text-muted-foreground">场</span>
          </div>
          <div className="mt-1 text-[10px] text-muted-foreground flex items-center gap-1">
             <MessageSquare className="h-3 w-3" />
            最新: {stats.talks.latest === "暂无" ? <span className="text-slate-400">暂无</span> : stats.talks.latest}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
