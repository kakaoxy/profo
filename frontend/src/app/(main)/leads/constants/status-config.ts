// 线索状态配置

/** 标签栏按钮样式 - 与 projects 保持一致的无边框风格 */
export const statusConfig: Record<string, { label: string; className: string }> = {
  all: {
    label: "全部",
    className: "bg-slate-500 text-white hover:bg-slate-600",
  },
  pending_assessment: {
    label: "待评估",
    className: "bg-primary text-white hover:bg-primary/90",
  },
  pending_visit: {
    label: "待看房",
    className: "bg-orange-500 text-white hover:bg-orange-600",
  },
  visited: {
    label: "已看房",
    className: "bg-emerald-500 text-white hover:bg-emerald-600",
  },
  signed: {
    label: "已签约",
    className: "bg-primary text-white hover:bg-primary/90",
  },
  rejected: {
    label: "已驳回",
    className: "bg-slate-300 text-slate-700 hover:bg-slate-400",
  },
};

/** 表格 badge 样式 - 用于 dashboard 等表格展示 */
export const statusBadgeConfig: Record<string, string> = {
  pending_assessment: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  pending_visit: "bg-primary/10 text-primary dark:bg-primary/20 dark:text-primary",
  rejected: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  visited: "bg-primary/10 text-primary",
  signed: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
};

/** 默认状态样式 */
export const defaultStatusClass =
  "bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400";

/** 获取状态文本 */
export function getStatusLabel(status: string): string {
  return statusConfig[status]?.label || status;
}

/** 获取表格 badge 样式 */
export function getStatusBadgeClass(status: string): string {
  return statusBadgeConfig[status] || defaultStatusClass;
}

export type LeadStatusTab = keyof typeof statusConfig;
