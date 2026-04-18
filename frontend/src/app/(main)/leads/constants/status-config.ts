// 线索状态配置 - 与 projects 保持一致的无边框风格
export const statusConfig: Record<string, { label: string; className: string }> = {
  all: {
    label: "全部",
    className: "bg-slate-500 text-white hover:bg-slate-600",
  },
  pending_assessment: {
    label: "待评估",
    className: "bg-blue-500 text-white hover:bg-blue-600",
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
    className: "bg-indigo-500 text-white hover:bg-indigo-600",
  },
  rejected: {
    label: "已驳回",
    className: "bg-slate-300 text-slate-700 hover:bg-slate-400",
  },
};

export type LeadStatusTab = keyof typeof statusConfig;
