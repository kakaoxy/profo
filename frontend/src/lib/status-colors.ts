/**
 * 全局状态配色系统
 * 
 * 统一配置所有业务状态的颜色，替代分散在各模块的硬编码颜色。
 * 颜色值与 CSS 变量联动，支持自动暗色模式切换。
 * 
 * @see globals.css 中的 --status-* 变量定义
 */

import { LeadStatus } from "@/app/(main)/leads/types";

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
  /** 步骤顺序（用于进度指示器） */
  step?: number;
}

/** 统一状态配置映射 */
export const STATUS_CONFIG: Record<StatusType, StatusConfig> = {
  pending: {
    label: "待评估",
    cssVar: "--status-pending",
    step: 0,
  },
  signing: {
    label: "已签约",
    cssVar: "--status-signing",
    step: 3,
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
    step: 0,
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

/** 项目状态映射：将项目状态字符串映射到通用 StatusType */
export const PROJECT_STATUS_MAPPING: Record<string, StatusType> = {
  signing: "signing",
  renovating: "renovating",
  selling: "selling",
  sold: "sold",
};

/**
 * 获取状态标签
 */
export function getStatusLabel(status: StatusType | string): string {
  return STATUS_CONFIG[status as StatusType]?.label || status;
}

/**
 * 获取状态 CSS 变量值（运行时读取）
 * 用于需要直接获取颜色值的场景（如图表）
 */
export function getStatusColor(status: StatusType): string {
  if (typeof window === "undefined") {
    // SSR 环境返回默认值
    const defaults: Record<StatusType, string> = {
      pending: "#f59e0b",
      signing: "#005daa",
      renovating: "#f97316",
      selling: "#10b981",
      sold: "#64748b",
      rejected: "#94a3b8",
    };
    return defaults[status];
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
  
  const statusClassMap: Record<StatusType, string> = {
    pending: "bg-status-pending text-white hover:opacity-90",
    signing: "bg-status-signing text-white hover:opacity-90",
    renovating: "bg-status-renovating text-white hover:opacity-90",
    selling: "bg-status-selling text-white hover:opacity-90",
    sold: "bg-status-sold text-white hover:opacity-90",
    rejected: "bg-status-rejected text-white hover:opacity-90",
  };
  
  return statusClassMap[mapped] || "bg-muted text-muted-foreground";
}

/**
 * 获取线索状态的 Badge 样式（浅色背景）
 * 用于表格、列表等展示场景
 */
export function getLeadStatusBadgeClass(status: LeadStatus): string {
  const mapped = LEAD_STATUS_MAPPING[status];
  
  const badgeClassMap: Record<StatusType, string> = {
    pending: "bg-status-pending/10 text-status-pending border-status-pending/20",
    signing: "bg-status-signing/10 text-status-signing border-status-signing/20",
    renovating: "bg-status-renovating/10 text-status-renovating border-status-renovating/20",
    selling: "bg-status-selling/10 text-status-selling border-status-selling/20",
    sold: "bg-status-sold/10 text-status-sold border-status-sold/20",
    rejected: "bg-status-rejected/10 text-status-rejected border-status-rejected/20",
  };
  
  return badgeClassMap[mapped] || "bg-muted text-muted-foreground";
}

/**
 * 获取项目状态的 Tailwind 类名
 */
export function getProjectStatusClassName(status: string): string {
  const mapped = PROJECT_STATUS_MAPPING[status];
  if (!mapped) return "bg-muted text-muted-foreground";
  
  const statusClassMap: Record<StatusType, string> = {
    pending: "bg-status-pending text-white hover:opacity-90",
    signing: "bg-status-signing text-white hover:opacity-90",
    renovating: "bg-status-renovating text-white hover:opacity-90",
    selling: "bg-status-selling text-white hover:opacity-90",
    sold: "bg-status-sold text-white hover:opacity-90",
    rejected: "bg-status-rejected text-white hover:opacity-90",
  };
  
  return statusClassMap[mapped] || "bg-muted text-muted-foreground";
}

/**
 * 获取项目状态的 Badge 样式
 */
export function getProjectStatusBadgeClass(status: string): string {
  const mapped = PROJECT_STATUS_MAPPING[status];
  if (!mapped) return "bg-muted text-muted-foreground";
  
  const badgeClassMap: Record<StatusType, string> = {
    pending: "bg-status-pending/10 text-status-pending border-status-pending/20",
    signing: "bg-status-signing/10 text-status-signing border-status-signing/20",
    renovating: "bg-status-renovating/10 text-status-renovating border-status-renovating/20",
    selling: "bg-status-selling/10 text-status-selling border-status-selling/20",
    sold: "bg-status-sold/10 text-status-sold border-status-sold/20",
    rejected: "bg-status-rejected/10 text-status-rejected border-status-rejected/20",
  };
  
  return badgeClassMap[mapped] || "bg-muted text-muted-foreground";
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
