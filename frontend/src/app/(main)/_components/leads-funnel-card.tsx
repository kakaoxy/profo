import type { FunnelData } from "../types";

interface LeadsFunnelCardProps {
  funnelData: FunnelData;
}

export function LeadsFunnelCard({ funnelData }: LeadsFunnelCardProps) {
  const { total, evaluating, rejected, visiting, signed } = funnelData;

  const stages = [
    { key: "total", label: "线索", value: total, color: "bg-primary" },
    { key: "evaluating", label: "评估", value: evaluating, color: "bg-primary/80" },
    { key: "rejected", label: "驳回", value: rejected, color: "bg-red-400" },
    { key: "visiting", label: "看房", value: visiting, color: "bg-primary/60" },
    { key: "signed", label: "签约", value: signed, color: "bg-primary/40" },
  ];

  const maxValue = Math.max(...stages.map((s) => s.value), 1);

  const getPercent = (value: number) =>
    total > 0 ? Math.round((value / total) * 100) : 0;

  return (
    <div className="col-span-12 lg:col-span-4 bg-white rounded-xl border border-slate-200 shadow-card p-5 h-40 flex flex-col">
      <span className="text-xs text-slate-400 font-black uppercase tracking-widest block mb-3">
        线索漏斗 Leads Funnel
      </span>

      <div className="flex-1 flex items-center gap-1.5">
        {stages.map((stage, index) => {
          const widthPercent = (stage.value / maxValue) * 100;
          const minWidth = stage.value > 0 ? 8 : 0;

          return (
            <div
              key={stage.key}
              className={`h-16 ${stage.color} rounded-md flex flex-col items-center justify-center text-white relative group cursor-pointer transition-all duration-300 hover:opacity-90`}
              style={{ flex: Math.max(widthPercent, minWidth) }}
              title={`${stage.label}: ${stage.value} (${getPercent(stage.value)}%)`}
            >
              <span className="text-[10px] font-bold opacity-90">{stage.label}</span>
              <span className="text-sm font-black">{stage.value}</span>

              <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[10px] text-slate-400 font-medium whitespace-nowrap">
                {getPercent(stage.value)}%
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex justify-between items-center mt-5 pt-2 border-t border-slate-100">
        <div className="flex items-center gap-4">
          <span className="text-xs text-slate-500">
            总线索: <span className="font-bold text-slate-700">{total}</span>
          </span>
          <span className="text-xs text-slate-500">
            签约: <span className="font-bold text-primary">{signed}</span>
          </span>
        </div>
        <span className="text-xs font-bold text-slate-700">
          转化率: {total > 0 ? ((signed / total) * 100).toFixed(1) : 0}%
        </span>
      </div>
    </div>
  );
}
