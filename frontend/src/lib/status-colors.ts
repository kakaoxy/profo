/**
 * 全局状态配色系统
 *
 * 统一配置所有业务状态的颜色，替代分散在各模块的硬编码颜色。
 * 颜色值与 CSS 变量联动，支持自动暗色模式切换。
 *
 * @see globals.css 中的 --status-* 变量定义
 */

import { LeadStatus } from "@/app/(main)/admin/leads/types";

/** 通用状态类型 */
export type StatusType =
  | "pending"        // 待评估
  | "signing"        // 已签约
  | "renovating"     // 装修中
  | "selling"        // 在售
  | "sold"           // 已成交/已售
  | "rejected";      // 已驳回

/** 线索专用状态 */
export type LeadStatusType = LeadStatus;

/** 项目专用状态 */
export type ProjectStatusType = "signing" | "renovating" | "selling" | "sold";

/** 状态配置项 */
export interface StatusConfig {
  label: string;
  /** CSS 变量名，如 --status-pending */
  cssVar: string;
}

/** 统一状态配置映射 */
export const STATUS_CONFIG: Record<StatusType, StatusConfig> = {
  pending: {
    label: "待评估",
    cssVar: "--status-pending",
  },
  signing: {
    label: "已签约",
    cssVar: "--status-signing",
  },
  renovating: {
    label: "装修中",
    cssVar: "--status-renovating",
  },
  selling: {
    label: "在售",
    cssVar: "--status-selling",
  },
  sold: {
    label: "已售",
    cssVar: "--status-sold",
  },
  rejected: {
    label: "已驳回",
    cssVar: "--status-rejected",
  },
};

/** 线索状态映射：将 LeadStatus 映射到通用 StatusType */
export const LEAD_STATUS_MAPPING: Record<LeadStatus, StatusType> = {
  [LeadStatus.PENDING_ASSESSMENT]: "pending",
  [LeadStatus.PENDING_VISIT]: "pending",
  [LeadStatus.VISITED]: "selling",
  [LeadStatus.SIGNED]: "signing",
  [LeadStatus.REJECTED]: "rejected",
};

/** 项目状态映射：将项目状态字符串映射到通用 StatusType（支持中英文+L3简写） */
export const PROJECT_STATUS_MAPPING: Record<string, StatusType> = {
  // 英文键名
  signing: "signing",
  renovating: "renovating",
  selling: "selling",
  sold: "sold",
  // 中文键名（与后端返回的 project.status 对应）
  签约: "signing",
  签约中: "signing",
  装修: "renovating",
  装修中: "renovating",
  挂牌: "selling",
  在售: "selling",
  已成交: "sold",
  已售: "sold",
  成交: "sold",
  已结束: "sold",
  // L4 营销项目状态映射
  在途: "signing",
  // 房源过期状态
  过期: "rejected",
};

/** 默认项目状态 */
export const DEFAULT_STATUS = "signing";

/** 默认状态样式 */
export const defaultStatusClass = "bg-muted text-muted-foreground";

const STATUS_CLASS_MAP: Record<StatusType, string> = {
  pending: "bg-status-pending text-white hover:opacity-90",
  signing: "bg-status-signing text-white hover:opacity-90",
  renovating: "bg-status-renovating text-white hover:opacity-90",
  selling: "bg-status-selling text-white hover:opacity-90",
  sold: "bg-status-sold text-white hover:opacity-90",
  rejected: "bg-status-rejected text-white hover:opacity-90",
};

const STATUS_BADGE_CLASS_MAP: Record<StatusType, string> = {
  pending: "bg-status-pending/10 text-status-pending border-status-pending/20",
  signing: "bg-status-signing/10 text-status-signing border-status-signing/20",
  renovating: "bg-status-renovating/10 text-status-renovating border-status-renovating/20",
  selling: "bg-status-selling/10 text-status-selling border-status-selling/20",
  sold: "bg-status-sold/10 text-status-sold border-status-sold/20",
  rejected: "bg-status-rejected/10 text-status-rejected border-status-rejected/20",
};

/**
 * SSR 环境下的状态颜色回退值
 * 必须与 globals.css 中 :root 的 --status-* 亮色模式值保持一致
 * @see globals.css Status Colors - Light Mode
 */
const SSR_STATUS_COLORS: Record<StatusType, string> = {
  pending: "#f59e0b",
  signing: "#005daa",
  renovating: "#f97316",
  selling: "#10b981",
  sold: "#64748b",
  rejected: "#94a3b8",
};

/**
 * 获取状态标签
 */
export function getStatusLabel(status: StatusType | string): string {
  // 如果是线索状态字符串，映射到通用 StatusType 后获取标签
  if (status in LEAD_STATUS_MAPPING) {
    const mappedStatus = LEAD_STATUS_MAPPING[status as LeadStatus];
    return STATUS_CONFIG[mappedStatus]?.label || status;
  }

  return STATUS_CONFIG[status as StatusType]?.label || status;
}

/**
 * 获取状态 CSS 变量值（运行时读取）
 * 用于需要直接获取颜色值的场景（如图表）
 */
export function getStatusColor(status: StatusType): string {
  if (typeof window === "undefined") {
    return SSR_STATUS_COLORS[status];
  }
  const style = getComputedStyle(document.documentElement);
  const cssVar = STATUS_CONFIG[status].cssVar;
  return style.getPropertyValue(cssVar).trim() || "#64748b";
}

/**
 * 获取所有状态颜色（用于图表等需要批量颜色的场景）
 */
export function getAllStatusColors(): Record<StatusType, string> {
  return {
    pending: getStatusColor("pending"),
    signing: getStatusColor("signing"),
    renovating: getStatusColor("renovating"),
    selling: getStatusColor("selling"),
    sold: getStatusColor("sold"),
    rejected: getStatusColor("rejected"),
  };
}

/**
 * 获取线索状态的 Tailwind 类名
 * 用于按钮、标签等组件
 */
export function getLeadStatusClassName(status: LeadStatus): string {
  const mapped = LEAD_STATUS_MAPPING[status];
  return STATUS_CLASS_MAP[mapped] || "bg-muted text-muted-foreground";
}

/**
 * 获取线索状态的 Badge 样式（浅色背景）
 * 用于表格、列表等展示场景
 */
export function getLeadStatusBadgeClass(status: LeadStatus | string): string {
  const stringStatusMap: Record<string, StatusType> = {
    pending_assessment: "pending",
    pending_visit: "pending",
    visited: "selling",
    signed: "signing",
    rejected: "rejected",
  };

  const mapped = typeof status === "string" && status in stringStatusMap
    ? stringStatusMap[status]
    : LEAD_STATUS_MAPPING[status as LeadStatus];

  return STATUS_BADGE_CLASS_MAP[mapped] || "bg-muted text-muted-foreground";
}

/**
 * 获取项目状态的 Tailwind 类名
 */
export function getProjectStatusClassName(status: string): string {
  const mapped = PROJECT_STATUS_MAPPING[status];
  if (!mapped) return "bg-muted text-muted-foreground";
  return STATUS_CLASS_MAP[mapped] || "bg-muted text-muted-foreground";
}

/**
 * 获取项目状态的 Badge 样式
 */
export function getProjectStatusBadgeClass(status: string): string {
  const mapped = PROJECT_STATUS_MAPPING[status];
  if (!mapped) return "bg-muted text-muted-foreground";
  return STATUS_BADGE_CLASS_MAP[mapped] || "bg-muted text-muted-foreground";
}

/**
 * 获取项目状态的左边框颜色类名
 * 用于卡片等需要左侧颜色条的场景
 */
export function getProjectStatusBorderClass(status: string): string {
  const mapped = PROJECT_STATUS_MAPPING[status];
  if (!mapped) return "";

  const borderClassMap: Record<ProjectStatusType, string> = {
    signing: "border-l-status-signing",
    renovating: "border-l-status-renovating",
    selling: "border-l-status-selling",
    sold: "border-l-status-sold",
  };

  return borderClassMap[mapped as ProjectStatusType] || "";
}

/**
 * 获取状态样式配置（带颜色类名）
 * 用于 drawer-header 等需要颜色类名的场景
 */
export function getStatusStyleConfig(status: string): { label: string; className: string } {
  const leadStatusMap: Record<string, { label: string; className: string }> = {
    pending_assessment: {
      label: "待评估",
      className: STATUS_BADGE_CLASS_MAP.pending,
    },
    pending_visit: {
      label: "待看房",
      className: STATUS_BADGE_CLASS_MAP.pending,
    },
    visited: {
      label: "已看房",
      className: STATUS_BADGE_CLASS_MAP.selling,
    },
    signed: {
      label: "已签约",
      className: STATUS_BADGE_CLASS_MAP.signing,
    },
    rejected: {
      label: "已驳回",
      className: STATUS_BADGE_CLASS_MAP.rejected,
    },
  };

  if (status in leadStatusMap) {
    return leadStatusMap[status];
  }

  const mapped = STATUS_CONFIG[status as StatusType];
  if (mapped) {
    return {
      label: mapped.label,
      className: STATUS_BADGE_CLASS_MAP[status as StatusType],
    };
  }

  return {
    label: status,
    className: "bg-muted text-muted-foreground",
  };
}

/** 线索生命周期步骤配置 */
export const LEAD_LIFECYCLE_STEPS = [
  { status: LeadStatus.PENDING_ASSESSMENT, label: "初筛评估", step: 0 },
  { status: LeadStatus.PENDING_VISIT, label: "上门实勘", step: 1 },
  { status: LeadStatus.VISITED, label: "商务谈判", step: 2 },
  { status: LeadStatus.SIGNED, label: "签约收房", step: 3 },
] as const;

/** 项目生命周期步骤配置 */
export const PROJECT_LIFECYCLE_STEPS = [
  { status: "signing", label: "签约", step: 0 },
  { status: "renovating", label: "装修", step: 1 },
  { status: "selling", label: "在售", step: 2 },
  { status: "sold", label: "已售", step: 3 },
] as const;

/** 发布状态类型 */
export type PublishStatusType = "published" | "draft";

/** 发布状态配置 */
export const PUBLISH_STATUS_CONFIG: Record<PublishStatusType, StatusConfig> = {
  published: {
    label: "已发布",
    cssVar: "--status-selling",
  },
  draft: {
    label: "草稿",
    cssVar: "--status-pending",
  },
};

/** 发布状态映射：将中文状态字符串映射到 PublishStatusType */
export const PUBLISH_STATUS_MAPPING: Record<string, PublishStatusType> = {
  发布: "published",
  草稿: "draft",
};

/** 发布状态样式映射 */
export const PUBLISH_STATUS_CLASS_MAP: Record<PublishStatusType, string> = {
  published: "bg-status-selling text-white",
  draft: "bg-status-pending text-white",
};
