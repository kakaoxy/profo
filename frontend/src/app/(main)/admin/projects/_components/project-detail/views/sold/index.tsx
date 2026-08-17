"use client";

import { useState } from "react";
import { Project } from "../../../../types";
import { ViewMode } from "../../constants";

import { SoldHeader } from "./header-section";
import { HeroMetrics } from "./hero-metrics";
import { FinancialLifecycle } from "./financial-lifecycle";
import { VisualJourney, SummaryReport } from "./visual-journey";
import { EditSalesInfoDialog } from "./edit-sales-info-dialog";

interface SoldViewProps {
  project: Project;
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  currentProjectStageIndex: number;
  onRefresh?: () => void;
  /** 页面级受控：Hero「修改销售信息」textlink 经此打开弹窗（两 prop 成对提供时生效） */
  editSalesInfoOpen?: boolean;
  onEditSalesInfoOpenChange?: (open: boolean) => void;
  /** 独立页场景隐藏顶部 SoldHeader（页面 Hero 已含项目名与阶段，避免重复；抽屉场景默认保留） */
  hideHeader?: boolean;
}

export function SoldView({
  project,
  viewMode,
  setViewMode,
  currentProjectStageIndex,
  onRefresh,
  editSalesInfoOpen,
  onEditSalesInfoOpenChange,
  hideHeader = false,
}: SoldViewProps) {
  // EditSalesInfoDialog 开关：页面级受控优先，否则退回内部 state（抽屉场景向后兼容）
  const [internalEditOpen, setInternalEditOpen] = useState(false);
  const isEditControlled =
    editSalesInfoOpen !== undefined && onEditSalesInfoOpenChange !== undefined;
  const editOpen = isEditControlled ? editSalesInfoOpen : internalEditOpen;
  const handleEditOpenChange = (open: boolean) => {
    if (isEditControlled) {
      onEditSalesInfoOpenChange?.(open);
    } else {
      setInternalEditOpen(open);
    }
  };

  return (
    <div className="h-full flex flex-col bg-muted/30">
      {/* 1. 顶部固定区域 (Header)：独立页 hideHeader 隐藏（页面 Hero 已含项目名与阶段） */}
      {!hideHeader && (
        <SoldHeader
          project={project}
          viewMode={viewMode}
          setViewMode={setViewMode}
          currentProjectStageIndex={currentProjectStageIndex}
        />
      )}

      {/* 2. 内容区域 (使用原生滚动确保稳定性) */}
      <div className="flex-1 overflow-y-auto scrollbar-hide">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-8">
          {/* 成交总览：锚点沿用页面级 project-section-overview 包裹层，此处不重复挂 id */}
          <HeroMetrics project={project} />

          <div id="project-section-financial" className="scroll-mt-28 md:scroll-mt-24">
            <FinancialLifecycle project={project} />
          </div>

          <div id="project-section-visual" className="scroll-mt-28 md:scroll-mt-24">
            <VisualJourney project={project} />
          </div>

          <div id="project-section-report" className="scroll-mt-28 md:scroll-mt-24">
            <SummaryReport project={project} />
          </div>

          {/* 底部留白 */}
          <div className="h-10" />
        </div>
      </div>

      {/* 修改销售信息弹窗（入口：页面级 Hero textlink / 抽屉内受控回退） */}
      <EditSalesInfoDialog
        project={project}
        open={editOpen}
        onOpenChange={handleEditOpenChange}
        onSuccess={onRefresh}
      />
    </div>
  );
}
