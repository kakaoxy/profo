"use client";

import { Project } from "../../../../types";
import { ListingKPIs } from "./kpi";
import { SellingBasicInfo } from "./basic-info";
import { SalesTeamPanel } from "./team-panel";
import { ActivityTabs } from "./activity-tabs";
import { DealDialog } from "./deal-dialog";
import { Badge } from "@/components/ui/badge";

interface SellingViewProps {
  project: Project;
  onRefresh?: () => void;
}

export function SellingView({ project, onRefresh }: SellingViewProps) {
  return (
    <div className="relative pb-24 animate-in fade-in slide-in-from-right-4 duration-300">
      {/* 0. 基础信息概览 */}
      <SellingBasicInfo project={project} />

      {/* 1. 顶部 KPI 看板 */}
      <ListingKPIs project={project} />

      {/* 2. 销售团队录入 */}
      <SalesTeamPanel project={project} />

      {/* 3. 核心记录 Tabs */}
      <ActivityTabs project={project} onRefresh={onRefresh} />

      {/* 4. 底部固定操作栏 */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-slate-100 flex items-center justify-between sm:absolute sm:rounded-b-xl z-10 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">当前状态</span>
          <Badge
            variant="secondary"
            className="bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border-none"
          >
            在售中
          </Badge>
        </div>

        <div className="w-[180px]">
          {/* 覆盖默认按钮样式为翠绿色 */}
          <div className="[&_button]:bg-emerald-600 [&_button]:hover:bg-emerald-700 [&_button]:text-white">
            <DealDialog project={project} onSuccess={onRefresh} />
          </div>
        </div>
      </div>
    </div>
  );
}
