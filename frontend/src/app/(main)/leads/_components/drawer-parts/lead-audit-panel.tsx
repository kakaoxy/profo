import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Gavel,
  AlertTriangle,
  CheckCircle2,
  FileCheck,
} from "lucide-react";
import { Lead, LeadStatus } from "../../types";

interface LeadAuditPanelProps {
  lead: Lead;
  onAudit: (
    leadId: string,
    status: LeadStatus,
    evalPrice?: number,
    reason?: string
  ) => void;
}

export const LeadAuditPanel: React.FC<LeadAuditPanelProps> = ({
  lead,
  onAudit,
}) => {
  const [auditReason, setAuditReason] = useState("");
  const [evalPrice, setEvalPrice] = useState<number | "">("");

  return (
    <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
      <div className="p-4 border-b bg-slate-50 flex items-center gap-2">
        <Gavel className="h-4 w-4 text-slate-600" />
        <span className="text-[10px] font-black uppercase tracking-widest text-slate-600">
          管理决策终端
        </span>
      </div>
      <div className="p-6 space-y-6">
        {lead.status === LeadStatus.PENDING_ASSESSMENT && (
          <PendingAssessmentPanel
            lead={lead}
            evalPrice={evalPrice}
            auditReason={auditReason}
            onEvalPriceChange={setEvalPrice}
            onAuditReasonChange={setAuditReason}
            onAudit={onAudit}
          />
        )}

        {lead.status === LeadStatus.PENDING_VISIT && (
          <PendingVisitPanel lead={lead} onAudit={onAudit} />
        )}

        {lead.status === LeadStatus.VISITED && (
          <VisitedPanel lead={lead} onAudit={onAudit} />
        )}

        {lead.status === LeadStatus.SIGNED && <SignedPanel />}

        {lead.status === LeadStatus.REJECTED && (
          <RejectedPanel auditReason={lead.auditReason} />
        )}
      </div>
    </div>
  );
};

interface PendingAssessmentPanelProps {
  lead: Lead;
  evalPrice: number | "";
  auditReason: string;
  onEvalPriceChange: (value: number | "") => void;
  onAuditReasonChange: (value: string) => void;
  onAudit: LeadAuditPanelProps["onAudit"];
}

const PendingAssessmentPanel: React.FC<PendingAssessmentPanelProps> = ({
  lead,
  evalPrice,
  auditReason,
  onEvalPriceChange,
  onAuditReasonChange,
  onAudit,
}) => (
  <div className="space-y-5">
    <div className="grid grid-cols-2 gap-4">
      <div className="space-y-1.5">
        <label className="text-[10px] font-black text-slate-400 uppercase ml-1">
          拟收房评估价 (万)
        </label>
        <input
          type="number"
          className="w-full h-11 px-4 border rounded-xl font-bold text-emerald-600 focus:ring-2 focus:ring-indigo-500/20"
          placeholder="输入评估价..."
          value={evalPrice}
          onChange={(e) => onEvalPriceChange(Number(e.target.value))}
        />
      </div>
      <div className="space-y-1.5">
        <label className="text-[10px] font-black text-slate-400 uppercase ml-1">
          评估意见摘要
        </label>
        <input
          className="w-full h-11 px-4 border rounded-xl text-sm"
          placeholder="如：溢价控制、户型优劣..."
          value={auditReason}
          onChange={(e) => onAuditReasonChange(e.target.value)}
        />
      </div>
    </div>
    <div className="grid grid-cols-2 gap-3">
      <Button
        className="h-12 rounded-xl bg-emerald-600 hover:bg-emerald-700 font-bold shadow-lg shadow-emerald-100"
        onClick={() =>
          onAudit(
            lead.id,
            LeadStatus.PENDING_VISIT,
            evalPrice || undefined,
            auditReason
          )
        }
      >
        批准约看排期
      </Button>
      <Button
        variant="outline"
        className="h-12 rounded-xl border-slate-200 text-slate-500 hover:bg-slate-50 font-bold"
        onClick={() =>
          onAudit(lead.id, LeadStatus.REJECTED, undefined, auditReason)
        }
      >
        评估不符-驳回
      </Button>
    </div>
  </div>
);

interface PendingVisitPanelProps {
  lead: Lead;
  onAudit: LeadAuditPanelProps["onAudit"];
}

const PendingVisitPanel: React.FC<PendingVisitPanelProps> = ({
  lead,
  onAudit,
}) => (
  <div className="space-y-4">
    <div className="bg-amber-50 border border-amber-100 p-4 rounded-xl flex gap-3">
      <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
      <div className="space-y-1">
        <p className="text-xs font-bold text-amber-800">当前阶段：实勘核验</p>
        <p className="text-[11px] text-amber-700 leading-relaxed">
          请协调实勘人员在 48
          小时内完成上门，重点核实房屋漏水、结构改动及物业欠费情况。
        </p>
      </div>
    </div>
    <Button
      className="w-full h-12 rounded-xl bg-indigo-600 hover:bg-indigo-700 font-bold shadow-lg"
      onClick={() => onAudit(lead.id, LeadStatus.VISITED)}
    >
      确认已完成现场实勘
    </Button>
  </div>
);

interface VisitedPanelProps {
  lead: Lead;
  onAudit: LeadAuditPanelProps["onAudit"];
}

const VisitedPanel: React.FC<VisitedPanelProps> = ({ lead, onAudit }) => (
  <div className="space-y-4">
    <div className="bg-emerald-50 border border-emerald-100 p-4 rounded-xl flex gap-3">
      <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
      <div className="space-y-1">
        <p className="text-xs font-bold text-emerald-800">实勘通过 - 等待签约</p>
        <p className="text-[11px] text-emerald-700 leading-relaxed">
          实勘报告已归档，数据模型显示该房源具备 Flip 价值。请发起最终商务谈判。
        </p>
      </div>
    </div>
    <Button
      className="w-full h-12 rounded-xl bg-indigo-900 hover:bg-black font-bold shadow-xl flex items-center gap-2"
      onClick={() => onAudit(lead.id, LeadStatus.SIGNED)}
    >
      <FileCheck className="h-4 w-4" /> 确认合同签署并收房
    </Button>
  </div>
);

const SignedPanel: React.FC = () => (
  <div className="text-center py-4">
    <div className="inline-flex h-12 w-12 rounded-full bg-emerald-100 text-emerald-600 items-center justify-center mb-3">
      <CheckCircle2 className="h-6 w-6" />
    </div>
    <h4 className="font-black text-slate-900">恭喜！已完成资产收储</h4>
    <p className="text-xs text-slate-500 mt-1">
      该房源已进入&quot;工程翻新&quot;阶段
    </p>
  </div>
);

interface RejectedPanelProps {
  auditReason?: string;
}

const RejectedPanel: React.FC<RejectedPanelProps> = ({ auditReason }) => (
  <div className="bg-slate-50 border p-4 rounded-xl">
    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">
      驳回原因
    </p>
    <p className="text-sm italic text-slate-600">
      &quot;{auditReason || "未填写具体原因"}&quot;
    </p>
  </div>
);
