"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Gavel,
  AlertTriangle,
  CheckCircle2,
  FileCheck,
  Target,
} from "lucide-react";
import { Lead, LeadStatus, EvalHistory } from "../../types";
import { createEvaluationAction } from "../../actions";
import { EvalHistoryList } from "./eval-history-list";

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
  const [evalRefreshKey, setEvalRefreshKey] = useState<number>(0);

  const handleEvalAdjusted = () => {
    setEvalRefreshKey((v) => v + 1);
  };

  const showEvalHistory =
    lead.status !== LeadStatus.PENDING_ASSESSMENT &&
    lead.status !== LeadStatus.REJECTED;

  return (
    <div className="bg-card rounded-2xl shadow-xl border border-border overflow-hidden">
      <div className="p-4 border-b bg-muted flex items-center gap-2">
        <Gavel className="h-4 w-4 text-muted-foreground" />
        <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
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
          <PendingVisitPanel
            lead={lead}
            onAudit={onAudit}
            onEvalAdjusted={handleEvalAdjusted}
          />
        )}

        {lead.status === LeadStatus.VISITED && (
          <VisitedPanel
            lead={lead}
            onAudit={onAudit}
            onEvalAdjusted={handleEvalAdjusted}
          />
        )}

        {lead.status === LeadStatus.SIGNED && <SignedPanel />}

        {lead.status === LeadStatus.REJECTED && (
          <RejectedPanel auditReason={lead.auditReason} />
        )}

        {showEvalHistory && (
          <EvalHistoryList
            leadId={lead.id}
            initialHistories={lead.evalHistories}
            refreshKey={evalRefreshKey}
          />
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
}) => {
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // 批准约看排期：先创建评估记录，成功后再流转状态
  const handleApprove = async () => {
    setError(null);
    if (!evalPrice) {
      setError("请输入评估价");
      return;
    }
    setSubmitting(true);
    const result = await createEvaluationAction(
      lead.id,
      Number(evalPrice),
      auditReason || undefined
    );
    setSubmitting(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    // onAudit 的 evalPrice 参数保留传递（后端 LeadUpdate 已不处理，保持接口兼容）
    onAudit(
      lead.id,
      LeadStatus.PENDING_VISIT,
      evalPrice || undefined,
      auditReason
    );
  };

  // 评估不符-驳回：不创建评估记录
  const handleReject = () => {
    setError(null);
    onAudit(lead.id, LeadStatus.REJECTED, undefined, auditReason);
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-[10px] font-black text-muted-foreground uppercase ml-1">
            拟收房评估价 (万)
          </label>
          <input
            type="number"
            className="w-full h-11 px-4 border rounded-xl font-bold text-success focus:ring-2 focus:ring-primary/20"
            placeholder="输入评估价..."
            value={evalPrice}
            onChange={(e) => onEvalPriceChange(Number(e.target.value))}
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-[10px] font-black text-muted-foreground uppercase ml-1">
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
      {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
      <div className="grid grid-cols-2 gap-3">
        <Button
          className="h-12 rounded-xl bg-success hover:brightness-95 font-bold shadow-lg shadow-emerald-100"
          onClick={handleApprove}
          disabled={submitting}
        >
          {submitting ? "提交中..." : "批准约看排期"}
        </Button>
        <Button
          variant="outline"
          className="h-12 rounded-xl border-border text-muted-foreground hover:bg-muted font-bold"
          onClick={handleReject}
        >
          评估不符-驳回
        </Button>
      </div>
    </div>
  );
};

interface CurrentEvalPriceSectionProps {
  lead: Lead;
  onEvalAdjusted?: (history: EvalHistory) => void;
}

// 当前评估价展示 + 调整评估价表单（PendingVisitPanel / VisitedPanel 共用）
const CurrentEvalPriceSection: React.FC<CurrentEvalPriceSectionProps> = ({
  lead,
  onEvalAdjusted,
}) => {
  const [showAdjustForm, setShowAdjustForm] = useState(false);
  const [newEvalPrice, setNewEvalPrice] = useState<number | "">("");
  const [adjustReason, setAdjustReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleAdjustSubmit = async () => {
    if (!newEvalPrice) return;
    setError(null);
    const result = await createEvaluationAction(
      lead.id,
      Number(newEvalPrice),
      adjustReason || undefined
    );
    if (result.success) {
      setShowAdjustForm(false);
      setNewEvalPrice("");
      setAdjustReason("");
      onEvalAdjusted?.(result.data);
    } else {
      setError(result.error);
    }
  };

  return (
    <div>
      <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-emerald-600" />
          <span className="text-xs text-muted-foreground">当前评估价</span>
          <span className="text-sm font-bold text-emerald-700">
            ¥{lead.evalPrice ?? "-"} 万
          </span>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowAdjustForm((v) => !v)}
        >
          调整评估价
        </Button>
      </div>
      {showAdjustForm && (
        <div className="mt-3 grid grid-cols-2 gap-3 p-3 bg-muted/30 rounded-xl">
          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-muted-foreground uppercase ml-1">
              新评估价 (万)
            </label>
            <input
              type="number"
              className="w-full h-11 px-4 border rounded-xl font-bold text-success focus:ring-2 focus:ring-primary/20"
              placeholder="输入新评估价..."
              value={newEvalPrice}
              onChange={(e) => setNewEvalPrice(Number(e.target.value))}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-muted-foreground uppercase ml-1">
              调整说明
            </label>
            <input
              className="w-full h-11 px-4 border rounded-xl text-sm"
              placeholder="如：市场行情变化、二次议价..."
              value={adjustReason}
              onChange={(e) => setAdjustReason(e.target.value)}
            />
          </div>
          <Button
            className="col-span-2 h-11 rounded-xl font-bold"
            onClick={handleAdjustSubmit}
            disabled={!newEvalPrice}
          >
            保存调整
          </Button>
          {error && (
            <p className="col-span-2 text-xs text-red-500 mt-2">{error}</p>
          )}
        </div>
      )}
    </div>
  );
};

interface PendingVisitPanelProps {
  lead: Lead;
  onAudit: LeadAuditPanelProps["onAudit"];
  onEvalAdjusted?: (history: EvalHistory) => void;
}

const PendingVisitPanel: React.FC<PendingVisitPanelProps> = ({
  lead,
  onAudit,
  onEvalAdjusted,
}) => (
  <div className="space-y-4">
    <CurrentEvalPriceSection lead={lead} onEvalAdjusted={onEvalAdjusted} />
    <div className="bg-status-pending/10 border border-amber-100 p-4 rounded-xl flex gap-3">
      <AlertTriangle className="h-5 w-5 text-status-pending shrink-0" />
      <div className="space-y-1">
        <p className="text-xs font-bold text-amber-800">当前阶段：实勘核验</p>
        <p className="text-[11px] text-amber-700 leading-relaxed">
          请协调实勘人员在 48
          小时内完成上门，重点核实房屋漏水、结构改动及物业欠费情况。
        </p>
      </div>
    </div>
    <Button
      className="w-full h-12 rounded-xl bg-primary hover:bg-primary/90 font-bold shadow-lg"
      onClick={() => onAudit(lead.id, LeadStatus.VISITED)}
    >
      确认已完成现场实勘
    </Button>
  </div>
);

interface VisitedPanelProps {
  lead: Lead;
  onAudit: LeadAuditPanelProps["onAudit"];
  onEvalAdjusted?: (history: EvalHistory) => void;
}

const VisitedPanel: React.FC<VisitedPanelProps> = ({
  lead,
  onAudit,
  onEvalAdjusted,
}) => (
  <div className="space-y-4">
    <CurrentEvalPriceSection lead={lead} onEvalAdjusted={onEvalAdjusted} />
    <div className="bg-success-container border border-emerald-100 p-4 rounded-xl flex gap-3">
      <CheckCircle2 className="h-5 w-5 text-success shrink-0" />
      <div className="space-y-1">
        <p className="text-xs font-bold text-emerald-800">实勘通过 - 等待签约</p>
        <p className="text-[11px] text-emerald-700 leading-relaxed">
          实勘报告已归档，数据模型显示该房源具备 Flip 价值。请发起最终商务谈判。
        </p>
      </div>
    </div>
    <Button
      className="w-full h-12 rounded-xl bg-primary hover:bg-primary/90 font-bold shadow-xl flex items-center gap-2"
      onClick={() => onAudit(lead.id, LeadStatus.SIGNED)}
    >
      <FileCheck className="h-4 w-4" /> 确认合同签署并收房
    </Button>
  </div>
);

const SignedPanel: React.FC = () => (
  <div className="text-center py-4">
    <div className="inline-flex h-12 w-12 rounded-full bg-emerald-100 text-success items-center justify-center mb-3">
      <CheckCircle2 className="h-6 w-6" />
    </div>
    <h4 className="font-black text-foreground">恭喜！已完成资产收储</h4>
    <p className="text-xs text-muted-foreground mt-1">
      该房源已进入&quot;工程翻新&quot;阶段
    </p>
  </div>
);

interface RejectedPanelProps {
  auditReason?: string;
}

const RejectedPanel: React.FC<RejectedPanelProps> = ({ auditReason }) => (
  <div className="bg-muted border p-4 rounded-xl">
    <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-1">
      驳回原因
    </p>
    <p className="text-sm italic text-muted-foreground">
      &quot;{auditReason || "未填写具体原因"}&quot;
    </p>
  </div>
);
