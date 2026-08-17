"use client";

import { Project } from "../../../../types";
import { ListingKPIs } from "./kpi";
import { SellingBasicInfo } from "./basic-info";
import { SalesTeamPanel } from "./team-panel";
import { ActivityTabs, type ActivityTabKey } from "./activity-tabs";

interface SellingViewProps {
  project: Project;
  onRefresh?: () => void;
  /** 保留接口兼容（页面层仍在传）：成交 CTA 已收口页面级 DealDialog，视图内不再消费 */
  onDealSuccess?: () => Promise<void>;
  /** 受控打开「实际结束日期」弹窗（页面级 flowbar「结束项目」接线） */
  endProjectDialogOpen?: boolean;
  onEndProjectDialogOpenChange?: (open: boolean) => void;
  /** 各类型销售记录数变化时上报（页面层分区导航计数徽标） */
  onActivityCounts?: (counts: { viewing: number; offer: number; negotiation: number }) => void;
  /** 外部指定激活的销售动态 tab（页面层分区导航联动） */
  activeActivityTab?: ActivityTabKey;
}

export function SellingView({
  project,
  onRefresh,
  endProjectDialogOpen,
  onEndProjectDialogOpenChange,
  onActivityCounts,
  activeActivityTab,
}: SellingViewProps) {
  return (
    <div className="animate-in fade-in slide-in-from-right-4 duration-300">
      {/* 0. KPI 看板 + 1. 基础信息（锚点：分区导航「销售看板」；设计稿 1429-1462：KPI 行在前、房源基础信息在后） */}
      <div id="project-section-selling" className="scroll-mt-28 md:scroll-mt-24">
        <ListingKPIs project={project} />
        <SellingBasicInfo
          project={project}
          onRefresh={onRefresh}
          endProjectDialogOpen={endProjectDialogOpen}
          onEndProjectDialogOpenChange={onEndProjectDialogOpenChange}
        />
      </div>

      {/* 2. 销售团队录入（锚点：分区导航「销售团队」） */}
      <div id="project-section-selling-team" className="scroll-mt-28 md:scroll-mt-24">
        <SalesTeamPanel project={project} />
      </div>

      {/* 3. 核心记录 Tabs（锚点：分区导航「带看/出价/面谈」；「结束项目/确认成交」CTA 收口至页面级 flowbar） */}
      <div id="project-section-selling-activity" className="scroll-mt-28 md:scroll-mt-24">
        <ActivityTabs
          project={project}
          onRefresh={onRefresh}
          onCountsChange={onActivityCounts}
          activeTab={activeActivityTab}
        />
      </div>
    </div>
  );
}
