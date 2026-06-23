"use client";

import React from "react";
import dynamic from "next/dynamic";
import { Lead } from "../types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Activity, Share2, Loader2, MapPinOff } from "lucide-react";
import { ProjectData } from "../../projects/_components/monitor/types";

// [性能优化] 使用动态导入延迟加载重型 Monitor 组件
// 这些组件只有在用户打开 Dashboard 时才会加载
const HeroSection = dynamic(
  () =>
    import("../../projects/_components/monitor/hero-section").then(
      (mod) => mod.HeroSection,
    ),
  { loading: () => <ComponentSkeleton height="200px" /> },
);

const MarketSentiment = dynamic(
  () =>
    import("../../projects/_components/monitor/market-sentiment").then(
      (mod) => mod.MarketSentiment,
    ),
  { loading: () => <ComponentSkeleton height="300px" /> },
);

const NeighborhoodRadar = dynamic(
  () =>
    import("../../projects/_components/monitor/neighborhood-radar").then(
      (mod) => mod.NeighborhoodRadar,
    ),
  { loading: () => <ComponentSkeleton height="350px" /> },
);

const TrendPositioning = dynamic(
  () =>
    import("../../projects/_components/monitor/trend-positioning").then(
      (mod) => mod.TrendPositioning,
    ),
  { loading: () => <ComponentSkeleton height="400px" /> },
);

const CompetitorsBrawl = dynamic(
  () =>
    import("../../projects/_components/monitor/competitors-brawl").then(
      (mod) => mod.CompetitorsBrawl,
    ),
  { loading: () => <ComponentSkeleton height="500px" /> },
);

const AIStrategy = dynamic(
  () =>
    import("../../projects/_components/monitor/ai-strategy").then(
      (mod) => mod.AIStrategy,
    ),
  { loading: () => <ComponentSkeleton height="300px" /> },
);

// Loading skeleton for dynamic components
function ComponentSkeleton({ height }: { height: string }) {
  return (
    <div
      className="flex items-center justify-center bg-muted"
      style={{ minHeight: height }}
    >
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}

interface Props {
  lead: Lead;
  onClose: () => void;
}

const CardWrapper = ({ children }: { children: React.ReactNode }) => (
  <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden mb-6">
    {children}
  </div>
);

// 空状态组件：当无法找到小区数据时显示
function EmptyState({ communityName }: { communityName: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
        <MapPinOff className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-semibold text-foreground mb-2">
        未找到小区数据
      </h3>
      <p className="text-sm text-muted-foreground max-w-md">
        系统未能找到 &quot;{communityName}&quot; 的市场数据。<br />
        该线索未关联有效小区，或小区数据尚未录入系统。
      </p>
    </div>
  );
}

export const MonitoringDashboard: React.FC<Props> = ({ lead, onClose }) => {
  // 使用 lead 中的 communityId，空值转换为 undefined 确保组件参数有效
  const communityId = lead.communityId || undefined;

  // Construct ProjectData from Lead to override HeroSection fetching
  const overrideData: ProjectData = {
    address: lead.communityName,
    community_name: lead.communityName,
    area: lead.area,
    signing_price: lead.totalPrice,
    list_price: lead.totalPrice,
    signing_date: lead.createdAt,
    signing_period: 0,
    extension_period: 0,
    extension_rent: 0,
  };

  const myOverridePrice =
    lead.unitPrice && lead.unitPrice > 0
      ? lead.unitPrice
      : lead.totalPrice && lead.area
        ? Math.round((lead.totalPrice * 10000) / lead.area)
        : 0;

  return (
    <div className="fixed inset-0 z-60 bg-background flex flex-col animate-in fade-in zoom-in-95 duration-300">
      {/* Header */}
      <header className="h-16 border-b bg-card flex items-center justify-between px-6 shrink-0">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="rounded-full"
            aria-label="返回"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="h-8 w-px bg-border" />
          <div>
            <h1 className="text-lg font-black font-sans tracking-tight">
              {lead.communityName} · 监控看板
            </h1>
            <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">
              Property Real-time Telemetry
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Badge
            variant="outline"
            className="bg-success-container text-emerald-700 border-emerald-100 font-bold"
          >
            <Activity className="h-3 w-3 mr-1" /> 实时数据同步中
          </Badge>
          <Button variant="outline" size="sm" className="h-9 px-4 rounded-full">
            <Share2 className="h-4 w-4 mr-2" /> 导出报告
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto bg-muted pb-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 font-sans">
          <CardWrapper>
            <HeroSection overrideData={overrideData} />
          </CardWrapper>

          {!communityId ? (
            <CardWrapper>
              <EmptyState communityName={lead.communityName} />
            </CardWrapper>
          ) : (
            <>
              <CardWrapper>
                <MarketSentiment communityId={communityId} />
              </CardWrapper>

              <CardWrapper>
                <NeighborhoodRadar communityId={communityId} />
              </CardWrapper>

              <CardWrapper>
                <TrendPositioning
                  communityId={communityId}
                  myOverridePrice={myOverridePrice}
                />
              </CardWrapper>

              <CardWrapper>
                <CompetitorsBrawl communityId={communityId} />
              </CardWrapper>

              <CardWrapper>
                <AIStrategy communityId={communityId} />
              </CardWrapper>
            </>
          )}
        </div>
      </main>
    </div>
  );
};
