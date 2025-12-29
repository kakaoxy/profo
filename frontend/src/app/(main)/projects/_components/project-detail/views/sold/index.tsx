"use client";

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

      {/* 2. 内容区域 (使用原生滚动确保稳定性) */}
      <div className="flex-1 overflow-y-auto scrollbar-hide">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-8">
          <HeroMetrics project={project} />

          <FinancialLifecycle project={project} />

          <div className="flex flex-col gap-8">
            <VisualJourney project={project} />
            <SummaryReport project={project} />
          </div>

          {/* 底部留白 */}
          <div className="h-10" />
        </div>
      </div>
    </div>
  );
}
