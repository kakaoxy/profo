"use client";

import React, { useState, useEffect } from "react";
import { Lead, LeadStatus, FollowUpMethod, FollowUp } from "../types";
import { getLeadFollowUpsAction } from "../actions";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { DrawerHeader } from "./drawer-parts/drawer-header";
import { LifecycleStepper } from "./drawer-parts/lifecycle-stepper";
import { TabsNav, TabId } from "./drawer-parts/tabs-nav";
import { InfoTab } from "./drawer-parts/info-tab";
import { MonitoringDashboard, MonitoringFullscreen } from "./monitoring-dashboard";

interface Props {
  lead: Lead | null;
  isOpen: boolean;
  onClose: () => void;
  onAudit: (leadId: string, status: LeadStatus, evalPrice?: number, reason?: string) => void;
  onAddFollowUp: (leadId: string, method: FollowUpMethod, content: string) => void;
  onImagesUpdate?: (leadId: string, images: string[]) => void;
}

export const LeadDrawer: React.FC<Props> = ({
  lead,
  isOpen,
  onClose,
  onAudit,
  onAddFollowUp,
  onImagesUpdate,
}) => {
  const [activeTab, setActiveTab] = useState<TabId>("info");
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [isMonitorFullscreen, setIsMonitorFullscreen] = useState(false);

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

  if (!lead) return null;

  return (
    <Sheet open={isOpen} onOpenChange={handleOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:w-[720px] sm:max-w-[720px] p-0 flex flex-col gap-0"
      >
        <SheetTitle className="sr-only">客户详情</SheetTitle>
        <DrawerHeader lead={lead} />

        <LifecycleStepper lead={lead} />

        <TabsNav
          activeTab={activeTab}
          onTabChange={setActiveTab}
          isMonitorFullscreen={isMonitorFullscreen}
          onToggleFullscreen={() => setIsMonitorFullscreen((v) => !v)}
        />

        <div
          key={lead.id}
          className="flex-1 overflow-y-auto p-6 space-y-8 no-scrollbar bg-fog"
        >
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
            />
          ) : (
            <MonitoringDashboard lead={lead} />
          )}
        </div>

        {/* 全屏 overlay：仅在 monitor Tab 激活且开启全屏时渲染，作为 Sheet 内部 absolute 层覆盖原内容 */}
        {isMonitorFullscreen && activeTab === "monitor" && (
          <MonitoringFullscreen lead={lead} onExit={() => setIsMonitorFullscreen(false)} />
        )}
      </SheetContent>
    </Sheet>
  );
};
