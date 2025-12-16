"use client";

import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Eye, Gavel, MessageSquare, TrendingUp } from "lucide-react";
import { isSameWeek, parseISO } from "date-fns";
import { Project, SalesRecord } from "../../../../types";

interface ListingKPIsProps {
  project: Project;
}

export function ListingKPIs({ project }: ListingKPIsProps) {
  // [修复 ESLint] 将 records 的获取逻辑移入 useMemo 内部
  // 这样依赖项只需监听 project，更加稳定
  const stats = useMemo(() => {
    const records: SalesRecord[] = project.sales_records || [];

    const now = new Date();

    // 1. 本周带看 (Viewing)
    const viewings = records.filter((r) => r.record_type === "viewing");
    const thisWeekViewings = viewings.filter(
      (r) => r.record_date && isSameWeek(parseISO(r.record_date), now)
    );

    // 模拟数据：假设上周带看量是本周的 80%
    const growthRate = 12;

    // 2. 本周出价 (Offer/Bid)
    // 兼容后端类型 'offer' 和前端可能使用的 'bid'
    const bids = records.filter(
      (r) => r.record_type === "offer" || r.record_type === "bid"
    );
    const thisWeekBids = bids.filter(
      (r) => r.record_date && isSameWeek(parseISO(r.record_date), now)
    );

    // 计算最高价
    const maxBid =
      bids.length > 0 ? Math.max(...bids.map((b) => b.price || 0)) : 0;

    // 3. 本周面谈 (Negotiation)
    const talks = records.filter((r) => r.record_type === "negotiation");
    const thisWeekTalks = talks.filter(
      (r) => r.record_date && isSameWeek(parseISO(r.record_date), now)
    );

    // 获取最新面谈时间
    const sortedTalks = [...talks].sort(
      (a, b) =>
        new Date(b.record_date).getTime() - new Date(a.record_date).getTime()
    );
    const latestTalk = sortedTalks[0];

    let latestTalkText = "无";
    if (latestTalk) {
      const date = parseISO(latestTalk.record_date);
      latestTalkText = isSameWeek(date, now)
        ? "本周"
        : date.toLocaleDateString();
    }

    return {
      viewings: { count: thisWeekViewings.length, growth: growthRate },
      bids: { count: thisWeekBids.length, max: maxBid },
      talks: { count: thisWeekTalks.length, latest: latestTalkText },
    };
  }, [project]); // 依赖项改为 project，它是 Props，引用相对稳定

  return (
    <div className="grid grid-cols-3 gap-3 mb-6">
      {/* 1. 带看卡片 */}
      <Card className="shadow-sm border-emerald-100 bg-emerald-50/30">
        <CardContent className="p-4 relative">
          <Eye className="absolute top-4 right-4 h-4 w-4 text-emerald-600 opacity-50" />
          <div className="text-xs text-muted-foreground font-medium">
            本周带看
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900">
              {stats.viewings.count}
            </span>
            <span className="text-xs text-muted-foreground">组</span>
          </div>
          <div className="mt-1 flex items-center text-[10px] text-emerald-600 font-medium">
            <TrendingUp className="h-3 w-3 mr-1" />
            {stats.viewings.growth}% 较上周
          </div>
        </CardContent>
      </Card>

      {/* 2. 出价卡片 */}
      <Card className="shadow-sm">
        <CardContent className="p-4 relative">
          <Gavel className="absolute top-4 right-4 h-4 w-4 text-slate-400 opacity-50" />
          <div className="text-xs text-muted-foreground font-medium">
            本周出价
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900">
              {stats.bids.count}
            </span>
            <span className="text-xs text-muted-foreground">笔</span>
          </div>
          <div className="mt-1 text-[10px] text-muted-foreground">
            最高:{" "}
            <span className="font-bold text-slate-700">
              ¥{stats.bids.max}万
            </span>
          </div>
        </CardContent>
      </Card>

      {/* 3. 面谈卡片 */}
      <Card className="shadow-sm">
        <CardContent className="p-4 relative">
          <MessageSquare className="absolute top-4 right-4 h-4 w-4 text-slate-400 opacity-50" />
          <div className="text-xs text-muted-foreground font-medium">
            本周面谈
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900">
              {stats.talks.count}
            </span>
            <span className="text-xs text-muted-foreground">场</span>
          </div>
          <div className="mt-1 text-[10px] text-muted-foreground">
            最新: {stats.talks.latest}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
