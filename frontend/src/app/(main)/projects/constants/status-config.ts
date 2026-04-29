// 项目状态配置

/** 默认状态 */
export const DEFAULT_STATUS = "signing";

/** 项目状态标签配置 */
export const statusConfig: Record<string, { label: string; className: string }> = {
  signing: {
    label: "签约",
    className: "bg-primary text-white hover:bg-primary/90",
  },
  renovating: {
    label: "装修",
    className: "bg-orange-500 text-white hover:bg-orange-600",
  },
  selling: {
    label: "在售",
    className: "bg-emerald-500 text-white hover:bg-emerald-600",
  },
  sold: {
    label: "已售",
    className: "bg-slate-300 text-slate-700 hover:bg-slate-400",
  },
};

/** 默认状态样式 */
export const defaultStatusClass = "bg-slate-100 text-slate-600";

/** 获取状态文本 */
export function getStatusLabel(status: string): string {
  return statusConfig[status]?.label || status;
}

/** 获取状态样式 */
export function getStatusClassName(status: string): string {
  return statusConfig[status]?.className || defaultStatusClass;
}
