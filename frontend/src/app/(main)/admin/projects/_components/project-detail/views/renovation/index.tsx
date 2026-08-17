"use client";

import { useEffect, useState } from "react";
import { logger } from "@/lib/logger";
import { Project } from "../../../../types";
import { getRenovationContractAction } from "../../../../actions/renovation";
import { RenovationKPIs, type RenovationContractMeta } from "./kpi";
import { RenovationTimeline } from "./timeline";
import { RenovationContractForm } from "./contract-form";

export type { RenovationContractMeta };

/**
 * 装修分区锚点 id（与 page-shell/config.ts PROJECT_SECTION_IDS 保持一致，
 * 分区导航「装修合同 / 装修进度」锚点滚动定位用）。
 * 分区导航顺序与渲染顺序一致：装修合同在前、装修进度在后（V4.4 业务指定）。
 */
const SECTION_IDS = {
  contract: "project-section-renovation-contract",
  progress: "project-section-renovation",
} as const;

interface RenovationViewProps {
  project: Project;
  onRefresh?: () => void;
  /** 上架成功回调（页面级 flowbar 的 ListingDialog 受控实例使用；视图内不再渲染触发按钮） */
  onListingSuccess?: () => Promise<void>;
  /**
   * 页面级装修合同摘要（V4.3：useTeamMembers 已上提拉取，签约/装修阶段共用）。
   * 传入后本视图不再自行拉取（避免双份请求）；不传（旧抽屉等场景）则保持内部自拉取。
   */
  contractMeta?: RenovationContractMeta;
}

export function RenovationView({
  project,
  onRefresh,
  contractMeta: externalMeta,
}: RenovationViewProps) {
  // 装修合同摘要（装修公司/对接负责人/实际开工/约定竣工）：
  // 页面级传入（externalMeta）时直接使用；否则挂载时单次拉取（旧抽屉等场景兜底）
  const [internalMeta, setInternalMeta] = useState<RenovationContractMeta>({});

  useEffect(() => {
    if (externalMeta !== undefined) return; // 页面级已提供，不自拉取
    let cancelled = false;
    const loadContractMeta = async () => {
      try {
        const result = await getRenovationContractAction(project.id);
        if (!cancelled && result.success && result.data) {
          setInternalMeta({
            companyName: result.data.renovation_company ?? undefined,
            contactPersonId: result.data.contact_person_id ?? undefined,
            actualStart: result.data.actual_start_date ?? undefined,
            expectedEnd: result.data.contract_end_date ?? undefined,
          });
        }
      } catch (error) {
        logger.error("获取装修合同摘要失败", error);
      }
    };
    loadContractMeta();
    return () => {
      cancelled = true;
    };
  }, [project.id, externalMeta]);

  const contractMeta = externalMeta ?? internalMeta;

  // V4.4：合同/进度两卡顺序渲染（无 Tabs），分区导航直接锚点滚动；
  // 展示顺序：装修合同在前 → 装修进度在后（与分区导航顺序一致，用户指定逻辑差异）
  return (
    <div className="space-y-5 animate-in fade-in slide-in-from-right-4 duration-300">
      <RenovationKPIs project={project} contractMeta={contractMeta} />

      {/* 装修合同信息（锚点：分区导航「装修合同」） */}
      <section id={SECTION_IDS.contract} className="scroll-mt-28 md:scroll-mt-24">
        <RenovationContractForm projectId={project.id} area={project.area} />
      </section>

      {/* 装修进度时间线（锚点：分区导航「装修进度」） */}
      <section id={SECTION_IDS.progress} className="scroll-mt-28 md:scroll-mt-24">
        <RenovationTimeline project={project} onRefresh={onRefresh} />
      </section>
    </div>
  );
}
