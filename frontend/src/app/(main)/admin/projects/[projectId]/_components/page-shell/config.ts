import type { ViewMode } from "../../../_components/project-detail/constants";

/**
 * V4 详情页外壳配置（Steep 风格）
 * 对应设计稿：docs/design/project-refV4/PROJECT-DETAIL-PAGE-DESIGN-V4.md
 */

/** 主列分区锚点 id（加 project-section- 前缀保证全页唯一） */
export const PROJECT_SECTION_IDS = {
  overview: "project-section-overview",
  documents: "project-section-documents",
  renovation: "project-section-renovation",
  renovationContract: "project-section-renovation-contract",
  selling: "project-section-selling",
  sellingTeam: "project-section-selling-team",
  sellingActivity: "project-section-selling-activity",
  financial: "project-section-financial",
  visual: "project-section-visual",
  report: "project-section-report",
} as const;

export interface SectionNavItem {
  id: string;
  label: string;
  /** 计数徽标（如文书数 / 带看·出价·面谈记录数） */
  count?: number;
  /** 点击时需先切换的视图内 tab（对齐 selling ActivityTabKey） */
  tabKey?: string;
}

/** 分区导航计数（由页面层按阶段传入） */
export interface SectionNavCounts {
  /** 签约「文书与附件」数 */
  documents?: number;
  viewing?: number;
  offer?: number;
  negotiation?: number;
}

/** 按当前 viewMode 动态生成 Sticky 分区导航条目（已下架无导航） */
export function getSectionNavItems(
  viewMode: ViewMode,
  counts?: SectionNavCounts,
): SectionNavItem[] {
  const overview: SectionNavItem = { id: PROJECT_SECTION_IDS.overview, label: "概览" };
  switch (viewMode) {
    case "signing":
      // V4.2 顺序渲染后「文书与附件」锚点始终存在，无需 tabKey 联动（直接锚点滚动）
      return [
        overview,
        {
          id: PROJECT_SECTION_IDS.documents,
          label: "文书与附件",
          count: counts?.documents,
        },
      ];
    case "renovation":
      // V4.4：装修合同在前、装修进度在后（业务指定展示顺序）；
      // 两卡已顺序渲染，无需 tabKey 联动，直接锚点滚动（对齐签约 V4.2 处理）
      return [
        { id: PROJECT_SECTION_IDS.renovationContract, label: "装修合同" },
        { id: PROJECT_SECTION_IDS.renovation, label: "装修进度" },
      ];
    case "selling":
      return [
        { id: PROJECT_SECTION_IDS.selling, label: "销售看板" },
        { id: PROJECT_SECTION_IDS.sellingTeam, label: "销售团队" },
        {
          id: PROJECT_SECTION_IDS.sellingActivity,
          label: "带看",
          count: counts?.viewing,
          tabKey: "viewing",
        },
        {
          id: PROJECT_SECTION_IDS.sellingActivity,
          label: "出价",
          count: counts?.offer,
          tabKey: "offer",
        },
        {
          id: PROJECT_SECTION_IDS.sellingActivity,
          label: "面谈",
          count: counts?.negotiation,
          tabKey: "negotiation",
        },
      ];
    case "sold":
      return [
        { ...overview, label: "成交总览" },
        { id: PROJECT_SECTION_IDS.financial, label: "财务生命周期" },
        { id: PROJECT_SECTION_IDS.visual, label: "视觉旅程" },
        { id: PROJECT_SECTION_IDS.report, label: "总结报告" },
      ];
    case "ended":
      return [];
    default:
      return [overview];
  }
}

export interface StageCtaConfig {
  label: string;
}

/** 阶段流转主 CTA（已售 / 已下架为终态，无 CTA） */
export function getStageCta(stageIndex: number): StageCtaConfig | null {
  switch (stageIndex) {
    case 0:
      return { label: "确认交房，开始装修" };
    case 1:
      return { label: "装修验收完成，上架销售" };
    case 2:
      return { label: "确认成交" };
    default:
      return null;
  }
}

/** 主 CTA 动作（底部 flowbar 与移动端吸底操作条共用） */
export interface StageCtaAction {
  label: string;
  onClick: () => void;
}

/** 业务形式 tag 文案（语义对齐列表 columns.tsx 的 BUSINESS_FORM_LABELS） */
export function getBusinessFormLabel(
  businessForm: "agent" | "wholesale" | null | undefined,
): string | null {
  if (businessForm === "agent") return "代理美化";
  if (businessForm === "wholesale") return "收购美化";
  return null;
}
