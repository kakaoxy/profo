import React from "react";
import { Card } from "@/components/ui/card";
import { Wallet, Target } from "lucide-react";
import { Lead } from "../../types";

interface LeadInfoCardsProps {
  lead: Lead;
}

export const LeadInfoCards: React.FC<LeadInfoCardsProps> = ({ lead }) => (
  <div className="grid grid-cols-2 gap-4">
    <Card className="border-none shadow-sm bg-white p-4">
      <div className="flex flex-col gap-1">
        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
          <Wallet className="h-3 w-3" /> 业主报价
        </span>
        <div className="text-2xl font-black text-indigo-900">
          ¥ {lead.totalPrice}{" "}
          <span className="text-xs font-bold text-slate-400 ml-1">万</span>
        </div>
        <div className="text-[10px] text-slate-400 font-bold uppercase">
          {lead.unitPrice?.toFixed(2)} 万/㎡ · {lead.area}㎡
        </div>
      </div>
    </Card>
    <Card className="border-none shadow-sm bg-white p-4">
      <div className="flex flex-col gap-1">
        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
          <Target className="h-3 w-3" /> 评估建议
        </span>
        <div className="text-2xl font-black text-emerald-600">
          {lead.evalPrice ? `¥ ${lead.evalPrice}` : "--"}{" "}
          <span className="text-xs font-bold text-slate-400 ml-1">万</span>
        </div>
        <div className="text-[10px] text-emerald-500 font-bold uppercase">
          {lead.evalPrice
            ? `建议价 vs 报价: ${((lead.evalPrice / lead.totalPrice - 1) * 100).toFixed(1)}%`
            : "待评估"}
        </div>
      </div>
    </Card>
  </div>
);
