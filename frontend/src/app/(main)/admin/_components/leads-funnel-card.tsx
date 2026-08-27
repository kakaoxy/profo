import Link from "next/link";
import { Plus } from "lucide-react";
import type { FunnelData } from "../types";
import { formatConversionRate } from "@/lib/formatters";

interface LeadsFunnelCardProps {
  funnelData: FunnelData;
}

export function LeadsFunnelCard({ funnelData }: LeadsFunnelCardProps) {
  const { total, evaluating, rejected, visiting, signed } = funnelData;

  const stages = [
    { key: "total", label: "线索", value: total, color: "bg-primary" },
    { key: "evaluating", label: "评估", value: evaluating, color: "bg-primary/80" },
    { key: "rejected", label: "放弃", value: rejected, color: "bg-red-400" },
    { key: "visiting", label: "看房", value: visiting, color: "bg-primary/60" },
    { key: "signed", label: "签约", value: signed, color: "bg-primary/40" },
  ];

  const maxValue = Math.max(...stages.map((s) => s.value), 1);

  const getPercent = (value: number) => (total > 0 ? Math.round((value / total) * 100) : 0);

  const conversionRate = formatConversionRate(total, signed);

  return (
    <div
      className="col-span-12 lg:col-span-6 bg-card rounded-xl border border-border shadow-card p-5 h-auto flex flex-col min-w-0"
      role="region"
      aria-label="线索漏斗转化"
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-muted-foreground font-black uppercase tracking-widest">
          线索漏斗
        </span>
        <Link
          href="/admin/leads/new"
          className="inline-flex items-center gap-1 rounded-full bg-primary text-primary-foreground text-xs font-bold px-3 py-1.5 hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          新增
        </Link>
      </div>

      <div
        className="flex-1 flex items-stretch gap-1 min-w-0"
        role="list"
        aria-label="各阶段线索数量"
      >
        {stages.map((stage) => {
          const widthPercent = (stage.value / maxValue) * 100;
          // 所有阶段都保证最小宽度,避免标签被挤压截断
          const minWidth = Math.max(widthPercent, 10);

          return (
            <div
              key={stage.key}
              role="listitem"
              className={`h-14 ${stage.color} rounded-md flex flex-col items-center justify-center text-white relative min-w-0 px-1`}
              style={{ flexGrow: minWidth, flexBasis: 0 }}
              title={`${stage.label}: ${stage.value} (${getPercent(stage.value)}%)`}
              aria-label={`${stage.label}: ${stage.value} 个, 占比 ${getPercent(stage.value)}%`}
            >
              <span className="text-[10px] font-bold opacity-90 text-center leading-tight truncate max-w-full">
                {stage.label}
              </span>
              <span className="text-sm font-black tabular-nums">{stage.value}</span>
            </div>
          );
        })}
      </div>

      <div className="flex justify-between items-center mt-2 pt-2 border-t border-border">
        <div className="flex items-center gap-4">
          <span className="text-xs text-muted-foreground">
            总线索: <span className="font-bold text-foreground tabular-nums">{total}</span>
          </span>
          <span className="text-xs text-muted-foreground hidden sm:inline">
            签约: <span className="font-bold text-primary tabular-nums">{signed}</span>
          </span>
        </div>
        <span className="text-xs font-bold text-foreground">转化率: {conversionRate}</span>
      </div>
    </div>
  );
}
