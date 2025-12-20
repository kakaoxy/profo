"use client";

import { ScrollArea } from "@/components/ui/scroll-area";
import { Project } from "../../../../types";
import { ViewMode } from "../../constants";

import { SoldHeader } from "./header-section";
import { HeroMetrics } from "./hero-metrics";
import { FinancialLifecycle } from "./financial-lifecycle";
import { VisualJourney, SummaryReport } from "./visual-journey";

interface SoldViewProps {
  project: Project;
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  currentProjectStageIndex: number;
}

export function SoldView({
  project,
  viewMode,
  setViewMode,
  currentProjectStageIndex,
}: SoldViewProps) {
  return (
    <div className="h-full flex flex-col bg-slate-50/30">
      {/* 1. 顶部固定区域 (Header) */}
      <SoldHeader
        project={project}
        viewMode={viewMode}
        setViewMode={setViewMode}
        currentProjectStageIndex={currentProjectStageIndex}
      />

      {/* 2. 滚动内容区域 */}
      <ScrollArea className="flex-1">
        <div className="max-w-5xl mx-auto px-6 py-2 md:px-6 md:py-2 space-y-2">
          <HeroMetrics project={project} />

          <FinancialLifecycle project={project} />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-4">
            <div>
              <VisualJourney project={project} />
            </div>
            <div>
              <SummaryReport project={project} />
            </div>
          </div>

          <div className="h-10" />
        </div>
      </ScrollArea>
    </div>
  );
}
