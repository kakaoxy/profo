"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { X } from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { HeroSection } from "./hero-section";
import { MarketSentiment } from "./market-sentiment";
import { NeighborhoodRadar } from "./neighborhood-radar";
import { TrendPositioning } from "./trend-positioning";
import { CompetitorsBrawl } from "./competitors-brawl";
import { AIStrategy } from "./ai-strategy";

// 新增：一个简单的包装组件，专门解决“糊在一起”的问题
// 它负责提供白色背景、边框和阴影，不改变内部布局
const CardWrapper = ({ children }: { children: React.ReactNode }) => (
  <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
    {children}
  </div>
);

export function MonitorSheet() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const monitorId = searchParams.get("monitor_id");
  const rawProjectName = searchParams.get("project_name");
  const projectName = rawProjectName ? decodeURIComponent(rawProjectName) : "";
  const isOpen = !!monitorId;

  const handleClose = () => {
    const params = new URLSearchParams(searchParams);
    params.delete("monitor_id");
    params.delete("project_name");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  if (!isOpen) return null;

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-none p-0 flex flex-col h-full border-l border-slate-200 shadow-xl overflow-hidden outline-none"
      >
        {/* Sticky Header */}
        <div className="flex-none bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between z-50 sticky top-0 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-md shadow-blue-200">
              <span className="text-sm font-bold">M</span>
            </div>
            <div>
              <SheetTitle className="text-xl font-bold text-slate-900">
                项目房价监控
              </SheetTitle>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-sm font-medium text-slate-500">{projectName}</span>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">Live Monitoring</span>
              </div>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-slate-50 border border-transparent hover:border-slate-200 rounded-lg transition-all text-slate-400 hover:text-slate-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto bg-slate-100 pb-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
            <CardWrapper>
              <HeroSection projectId={monitorId} projectName={projectName} />
            </CardWrapper>
            <CardWrapper>
              <MarketSentiment projectId={monitorId} />
            </CardWrapper>
            <CardWrapper>
              <NeighborhoodRadar projectId={monitorId} />
            </CardWrapper>
            <CardWrapper>
              <TrendPositioning projectId={monitorId} />
            </CardWrapper>
            <CardWrapper>
              <CompetitorsBrawl projectId={monitorId} />
            </CardWrapper>
            <CardWrapper>
              <AIStrategy projectId={monitorId} />
            </CardWrapper>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}