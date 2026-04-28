import type { FunnelData } from "../types";

interface LeadsFunnelCardProps {
  funnelData: FunnelData;
}

export function LeadsFunnelCard({ funnelData }: LeadsFunnelCardProps) {
  return (
    <div className="col-span-12 lg:col-span-4 bg-white rounded-xl border border-slate-200 shadow-card p-6 h-40">
      <span className="text-xs text-slate-400 font-black uppercase tracking-widest block mb-5">
        线索漏斗 Leads Funnel
      </span>
      <div className="flex h-10 items-stretch gap-0.5 rounded-lg overflow-hidden">
        <div
          className="bg-primary flex items-center justify-center text-[10px] text-white font-bold"
          style={{ flex: 4 }}
          title="Total Leads"
        >
          线索 {funnelData.total}
        </div>
        <div
          className="bg-primary/80 flex items-center justify-center text-[10px] text-white font-bold"
          style={{ flex: 3 }}
          title="Evaluation"
        >
          评估 {funnelData.evaluating}
        </div>
        <div
          className="bg-red-400 flex items-center justify-center text-[10px] text-white font-bold"
          style={{ flex: 2 }}
          title="Rejected"
        >
          驳回 {funnelData.rejected}
        </div>
        <div
          className="bg-primary/60 flex items-center justify-center text-[10px] text-white font-bold"
          style={{ flex: 2 }}
          title="Visit"
        >
          看房 {funnelData.visiting}
        </div>
        <div
          className="bg-primary/40 flex items-center justify-center text-[10px] text-white font-bold"
          style={{ flex: 1 }}
          title="Deal"
        >
          签约 {funnelData.signed}
        </div>
      </div>
      <div className="flex justify-between mt-2.5 px-1">
        <span className="text-[10px] text-slate-400 font-medium">100%</span>
        <span className="text-[10px] text-slate-400 font-medium">50%</span>
        <span className="text-[10px] text-slate-400 font-medium">25%</span>
        <span className="text-[10px] text-slate-400 font-medium">6.2%</span>
      </div>
    </div>
  );
}
