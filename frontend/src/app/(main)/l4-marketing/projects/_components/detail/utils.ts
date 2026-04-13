"use client";

// 状态配置 - 与 projects 保持一致
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

// 发布状态配置
export const publishStatusConfig: Record<string, { label: string; className: string }> = {
  "发布": {
    label: "已发布",
    className: "bg-emerald-500 text-white",
  },
  "草稿": {
    label: "草稿",
    className: "bg-amber-500 text-white",
  },
};

// 格式化价格
export function formatPrice(value: number | string | undefined | null): string {
  if (value === undefined || value === null) return "-";
  const numValue = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(numValue)) return "-";
  return `¥${numValue.toLocaleString()}`;
}

// 格式化面积
export function formatArea(value: number | string | undefined | null): string {
  if (value === undefined || value === null) return "-";
  const numValue = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(numValue)) return "-";
  return `${numValue.toLocaleString()} m²`;
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

// 获取发布状态配置
export function getPublishStatusConfig(status: string) {
  return (
    publishStatusConfig[status] || {
      label: status,
      className: "bg-slate-100 text-slate-600",
    }
  );
}
