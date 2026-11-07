"use client";

import React, { useState, useEffect } from "react";
import { Plus } from "lucide-react";
import { Lead, LeadStatus, FollowUpConclusion, FollowUpMethod, FollowUp } from "../types";
import { getLeadFollowUpsAction } from "../actions";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { DrawerHeader } from "./drawer-parts/drawer-header";
import { LifecycleStepper } from "./drawer-parts/lifecycle-stepper";
import { TabsNav, TabId } from "./drawer-parts/tabs-nav";
import { InfoTab } from "./drawer-parts/info-tab";
import { MonitoringDashboard, MonitoringFullscreen } from "./monitoring-dashboard";
import { LeadAssessmentModal } from "./lead-assessment-modal";

interface Props {
  lead: Lead | null;
  isOpen: boolean;
  onClose: () => void;
  onAudit: (leadId: string, status: LeadStatus, evalPrice?: number, reason?: string) => void;
  onAddFollowUp: (
    leadId: string,
    method: FollowUpMethod,
    content: string,
    conclusion?: FollowUpConclusion | null,
  ) => void;
  onImagesUpdate?: (leadId: string, images: string[]) => void;
  onEdit?: (lead: Lead) => void;
}

export const LeadDrawer: React.FC<Props> = ({
  lead,
  isOpen,
  onClose,
  onAudit,
  onAddFollowUp,
  onImagesUpdate,
  onEdit,
}) => {
  const [activeTab, setActiveTab] = useState<TabId>("info");
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [isMonitorFullscreen, setIsMonitorFullscreen] = useState(false);
  const [assessmentOpen, setAssessmentOpen] = useState(false);

  const leadId = lead?.id;
  useEffect(() => {
    if (leadId && isOpen) {
      getLeadFollowUpsAction(leadId).then((result) => {
        if (result.success) setFollowUps(result.data);
      });
    }
  }, [isOpen, leadId]);

  // 切换线索或抽屉重新打开时重置 Tab 与全屏状态
  // 采用 React "Adjusting state when a prop changes" 模式，避免 useEffect 内同步 setState
  // 触发 react-hooks/set-state-in-effect 警告
  const resetKey = isOpen ? (lead?.id ?? null) : null;
  const [prevResetKey, setPrevResetKey] = useState<string | null | undefined>(undefined);
  if (resetKey !== prevResetKey) {
    setPrevResetKey(resetKey);
    setAssessmentOpen(false);
    if (isOpen) {
      setActiveTab("info");
      setIsMonitorFullscreen(false);
    }
  }

  // ESC 键处理：全屏状态下退出全屏，否则交给 Sheet 自身处理关闭
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (isMonitorFullscreen) {
          e.preventDefault();
          setIsMonitorFullscreen(false);
        }
        // 否则交给 Sheet 自身处理关闭
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, isMonitorFullscreen]);

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      onClose();
    }
  };

  const handleRecordFollowUp = () => {
    setActiveTab("info");
    window.setTimeout(() => {
      const input = document.getElementById("follow-up-content");
      input?.scrollIntoView({ behavior: "smooth", block: "center" });
      (input as HTMLInputElement | null)?.focus();
    }, 60);
  };

  if (!lead) return null;

  return (
    <Sheet open={isOpen} onOpenChange={handleOpenChange}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="z-[60] flex w-full flex-col gap-0 border-l-0 bg-pure-white p-0 max-sm:inset-y-0 max-sm:right-0 max-sm:h-full sm:inset-y-3 sm:right-3 sm:h-auto sm:w-[720px] sm:max-w-[720px] sm:rounded-cards"
      >
        <SheetTitle className="sr-only">客户详情</SheetTitle>
        <DrawerHeader
          lead={lead}
          onEdit={onEdit ? () => onEdit(lead) : undefined}
          onClose={onClose}
        />

        <LifecycleStepper lead={lead} />

        <TabsNav
          activeTab={activeTab}
          onTabChange={setActiveTab}
          isMonitorFullscreen={isMonitorFullscreen}
          onToggleFullscreen={() => setIsMonitorFullscreen((v) => !v)}
        />

        <div key={lead.id} className="flex-1 overflow-y-auto px-6 pb-6 pt-4 no-scrollbar sm:px-7">
          {activeTab === "info" ? (
            <InfoTab
              lead={lead}
              onAudit={onAudit}
              followUps={followUps}
              onAddFollowUp={onAddFollowUp}
              onRefreshFollowUps={setFollowUps}
              onImagesUpdate={
                onImagesUpdate ? (images) => onImagesUpdate(lead.id, images) : undefined
              }
              onOpenAssessment={() => setAssessmentOpen(true)}
            />
          ) : (
            <MonitoringDashboard lead={lead} />
          )}
        </div>

        <div className="flex flex-none items-center justify-between gap-3 border-t border-dove/25 bg-pure-white px-6 py-3.5 sm:px-7">
          {onEdit ? (
            <button
              type="button"
              className="text-[10.5px] text-graphite transition-colors hover:text-ink"
              onClick={() => onEdit(lead)}
            >
              编辑线索
            </button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-4">
            <button
              type="button"
              className="text-[10px] text-graphite underline underline-offset-2 transition-colors hover:text-ink"
              onClick={handleRecordFollowUp}
            >
              记录一条跟进
            </button>
            <button
              type="button"
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-ink px-4 text-[10.5px] font-[450] text-white transition-colors hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30"
              onClick={handleRecordFollowUp}
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={1.8} />
              记录跟进
            </button>
          </div>
        </div>

        {/* 全屏 overlay：仅在 monitor Tab 激活且开启全屏时渲染，作为 Sheet 内部 absolute 层覆盖原内容 */}
        {isMonitorFullscreen && activeTab === "monitor" && (
          <MonitoringFullscreen lead={lead} onExit={() => setIsMonitorFullscreen(false)} />
        )}
      </SheetContent>
      <LeadAssessmentModal
        lead={lead}
        open={assessmentOpen}
        onClose={() => setAssessmentOpen(false)}
        onAudit={onAudit}
      />
    </Sheet>
  );
};
