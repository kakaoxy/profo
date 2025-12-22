"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { X } from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { HeroSection} from "./hero-section";
import { MarketSentiment } from "./market-sentiment";
import { NeighborhoodRadar } from "./neighborhood-radar";
import { TrendPositioning } from "./trend-positioning";
import { CompetitorsBrawl } from "./competitors-brawl";
import { AIStrategy } from "./ai-strategy";

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
        className="w-full sm:max-w-none bg-white p-0 flex flex-col h-full border-l border-slate-200 shadow-2xl overflow-hidden"
      >
        {/* Sticky Header */}
        <div className="flex-none bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between z-20 sticky top-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-lg shadow-blue-200">
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
            className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto bg-slate-50/30 pb-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-8">
          <HeroSection projectId={monitorId} projectName={projectName} />
          <MarketSentiment projectId={monitorId} />
          <NeighborhoodRadar projectId={monitorId} />
          <TrendPositioning projectId={monitorId} />
          <CompetitorsBrawl projectId={monitorId} />
          <AIStrategy projectId={monitorId} />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
