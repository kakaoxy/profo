"use client";

import type { L4MarketingProject, L4Consultant, L4MarketingMedia } from "../../types";

// 状态配置
export const statusConfig: Record<string, { label: string; className: string }> = {
  "在售": {
    label: "在售",
    className: "bg-emerald-500 text-white",
  },
  "已售": {
    label: "已售",
    className: "bg-slate-300 text-slate-700",
  },
  "在途": {
    label: "在途",
    className: "bg-blue-500 text-white",
  },
};

// 格式化价格
export function formatPrice(value: number | undefined | null): string {
  if (value === undefined || value === null) return "-";
  return `¥${value.toLocaleString()}`;
}

// 格式化面积
export function formatArea(value: number | undefined | null): string {
  if (value === undefined || value === null) return "-";
  return `${value.toLocaleString()} m²`;
}

// 获取顾问名称
export function getConsultantName(
  project: L4MarketingProject,
  consultants: L4Consultant[]
): string {
  return (
    project.consultant?.name ??
    consultants.find((c) => c.id === project.consultant_id)?.name ??
    "-"
  );
}

// 获取项目状态配置
export function getStatusConfig(status: string) {
  return (
    statusConfig[status] || {
      label: status,
      className: "bg-slate-100 text-slate-600",
    }
  );
}
