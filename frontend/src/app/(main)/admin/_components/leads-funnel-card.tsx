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

  const conversionRate =
    total > 0 && signed > 0 ? ((signed / total) * 100).toFixed(1) + "%" : "暂无";

  return (
    <div className="col-span-12 lg:col-span-6 bg-card rounded-xl border border-border shadow-card p-5 h-auto flex flex-col min-w-0">
      <span className="text-xs text-muted-foreground font-black uppercase tracking-widest block mb-2">
        线索漏斗
      </span>

      <div className="flex-1 flex items-stretch gap-1 min-w-0">
        {stages.map((stage) => {
          const widthPercent = (stage.value / maxValue) * 100;
          // 所有阶段都保证最小宽度,避免标签被挤压截断
          const minWidth = Math.max(widthPercent, 10);

          return (
            <div
              key={stage.key}
              className={`h-14 ${stage.color} rounded-md flex flex-col items-center justify-center text-white relative group cursor-pointer transition-all duration-300 hover:opacity-90 min-w-0 px-1`}
              style={{ flex: minWidth }}
              title={`${stage.label}: ${stage.value} (${getPercent(stage.value)}%)`}
            >
              <span className="text-[10px] font-bold opacity-90 text-center leading-tight whitespace-nowrap">
                {stage.label}
              </span>
              <span className="text-sm font-black">{stage.value}</span>
            </div>
          );
        })}
      </div>

      <div className="flex justify-between items-center mt-2 pt-2 border-t border-border">
        <div className="flex items-center gap-4">
          <span className="text-xs text-muted-foreground">
            总线索: <span className="font-bold text-foreground">{total}</span>
          </span>
          <span className="text-xs text-muted-foreground hidden sm:inline">
            签约: <span className="font-bold text-primary">{signed}</span>
          </span>
        </div>
        <span className="text-xs font-bold text-foreground">
          转化率: {conversionRate}
        </span>
      </div>
    </div>
  );
}
