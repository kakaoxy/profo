import { LeadStatus } from "../types";

/**
 * 线索状态徽章公共基类（Steep 语言）：
 * 胶囊圆角、去原生边框与阴影。各状态配色串由 badgeClass 提供。
 */
export const LEAD_BADGE_BASE =
  "rounded-full border-none shadow-none inline-flex items-center whitespace-nowrap";

/** 线索状态展示元信息 */
export interface LeadStatusMeta {
  /** 展示文案（admin 后台统一硬编码中文） */
  label: string;
  /** 徽章完整类串（已叠入 LEAD_BADGE_BASE，可直接传入 cn()） */
  badgeClass: string;
}

/**
 * 统一状态元信息映射：leads 模块状态展示的唯一来源。
 * 白底使用 Steep token `bg-pure-white`（globals.css @theme --color-pure-white）。
 */
export const LEAD_STATUS_META: Record<LeadStatus, LeadStatusMeta> = {
  [LeadStatus.PENDING_ASSESSMENT]: {
    label: "待评估",
    badgeClass: `${LEAD_BADGE_BASE} bg-apricot-wash text-rust`,
  },
  [LeadStatus.PENDING_VISIT]: {
    label: "待看房",
    badgeClass: `${LEAD_BADGE_BASE} bg-sky-wash text-ink`,
  },
  [LeadStatus.VISITED]: {
    label: "已看房",
    badgeClass: `${LEAD_BADGE_BASE} border border-dove bg-pure-white text-ink`,
  },
  [LeadStatus.SIGNED]: {
    label: "已签约",
    badgeClass: `${LEAD_BADGE_BASE} bg-ink text-white`,
  },
  [LeadStatus.REJECTED]: {
    label: "已放弃",
    badgeClass: `${LEAD_BADGE_BASE} bg-fog text-graphite`,
  },
  [LeadStatus.LOST_TO_COMPETITOR]: {
    label: "他司已成交",
    badgeClass: `${LEAD_BADGE_BASE} bg-fog text-rust`,
  },
};
