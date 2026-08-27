"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Gavel, AlertTriangle, CheckCircle2, FileCheck, Target } from "lucide-react";
import { Lead, LeadStatus, EvalHistory } from "../../types";
import { createEvaluationAction } from "../../actions";
import { safeFormatDate } from "@/lib/formatters";
import { EvalHistoryList } from "./eval-history-list";

interface LeadAuditPanelProps {
  lead: Lead;
  onAudit: (leadId: string, status: LeadStatus, evalPrice?: number, reason?: string) => void;
}

export const LeadAuditPanel: React.FC<LeadAuditPanelProps> = ({ lead, onAudit }) => {
  const [auditReason, setAuditReason] = useState("");
  const [evalPrice, setEvalPrice] = useState<number | "">("");
  const [evalRefreshKey, setEvalRefreshKey] = useState<number>(0);

  const handleEvalAdjusted = () => {
    setEvalRefreshKey((v) => v + 1);
  };

  const showEvalHistory =
    lead.status !== LeadStatus.PENDING_ASSESSMENT &&
    lead.status !== LeadStatus.REJECTED &&
    lead.status !== LeadStatus.LOST_TO_COMPETITOR;

  return (
    <div className="bg-card rounded-2xl shadow-sm border border-dove overflow-hidden">
      <div className="p-4 border-b border-dove bg-fog flex items-center gap-2">
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
          <PendingVisitPanel lead={lead} onAudit={onAudit} onEvalAdjusted={handleEvalAdjusted} />
        )}

        {lead.status === LeadStatus.VISITED && (
          <VisitedPanel lead={lead} onAudit={onAudit} onEvalAdjusted={handleEvalAdjusted} />
        )}

        {lead.status === LeadStatus.SIGNED && <SignedPanel />}

        {lead.status === LeadStatus.REJECTED && (
          <RejectedPanel
            auditReason={lead.auditReason}
            auditTime={lead.auditTime ?? lead.updatedAt}
          />
        )}

        {lead.status === LeadStatus.LOST_TO_COMPETITOR && (
          <LostToCompetitorPanel
            auditReason={lead.auditReason}
            auditTime={lead.auditTime ?? lead.updatedAt}
          />
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
      auditReason || undefined,
    );
    setSubmitting(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    // onAudit 的 evalPrice 参数保留传递（后端 LeadUpdate 已不处理，保持接口兼容）
    onAudit(lead.id, LeadStatus.PENDING_VISIT, evalPrice || undefined, auditReason);
  };

  // 评估不符-放弃：不创建评估记录
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
            className="w-full h-11 px-4 border rounded-xl font-bold text-success focus:ring-2 focus:ring-ink/20"
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
          className="h-12 rounded-full bg-ink text-white hover:bg-ink/90 font-bold"
          onClick={handleApprove}
          disabled={submitting}
        >
          {submitting ? "提交中..." : "批准约看排期"}
        </Button>
        <Button
          className="h-12 rounded-full bg-pure-white border border-dove text-ink hover:border-ink/60 hover:bg-fog/50 font-bold"
          onClick={handleReject}
        >
          评估不符-放弃
        </Button>
      </div>
      <MarkLostSection
        onConfirm={(reason) =>
          onAudit(lead.id, LeadStatus.LOST_TO_COMPETITOR, undefined, reason)
        }
      />
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
      adjustReason || undefined,
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
          <span className="text-sm font-medium text-ink tabular-nums">
            ¥{lead.evalPrice ?? "-"} 万
          </span>
        </div>
        <Button
          size="sm"
          className="rounded-full bg-pure-white border border-dove text-ink hover:border-ink/60 hover:bg-fog/50 font-bold"
          onClick={() => setShowAdjustForm((v) => !v)}
        >
          调整评估价
        </Button>
      </div>
      {showAdjustForm && (
        <div className="mt-3 grid grid-cols-2 gap-3 p-3 bg-fog rounded-xl">
          <div className="space-y-1.5">
            <label className="text-xs text-graphite ml-1">新评估价 (万)</label>
            <input
              type="number"
              className="w-full h-11 px-4 rounded-inputs border border-dove bg-pure-white text-sm font-bold text-ink tabular-nums outline-none focus:ring-2 focus:ring-ink/20 focus:border-ink/40"
              placeholder="输入新评估价..."
              value={newEvalPrice}
              onChange={(e) => setNewEvalPrice(Number(e.target.value))}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-graphite ml-1">调整说明</label>
            <input
              className="w-full h-11 px-4 rounded-inputs border border-dove bg-pure-white text-sm text-ink outline-none focus:ring-2 focus:ring-ink/20 focus:border-ink/40"
              placeholder="如：市场行情变化、二次议价..."
              value={adjustReason}
              onChange={(e) => setAdjustReason(e.target.value)}
            />
          </div>
          <Button
            className="col-span-2 h-11 rounded-full bg-pure-white border border-dove text-ink hover:border-ink/60 hover:bg-fog/50 font-bold"
            onClick={handleAdjustSubmit}
            disabled={!newEvalPrice}
          >
            保存调整
          </Button>
          {error && <p className="col-span-2 text-xs text-red-500 mt-2">{error}</p>}
        </div>
      )}
    </div>
  );
};

interface MarkLostSectionProps {
  onConfirm: (reason?: string) => void;
}

const MarkLostSection: React.FC<MarkLostSectionProps> = ({ onConfirm }) => {
  const [reason, setReason] = useState("");
  return (
    <div className="space-y-2 border-t border-dashed border-dove pt-3">
      <input
        className="w-full h-10 px-4 border border-dove rounded-inputs bg-pure-white text-sm text-ink outline-none focus:ring-2 focus:ring-ink/20 focus:border-ink/40"
        placeholder="原因（选填）"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
      <Button
        className="w-full h-11 rounded-full bg-pure-white border border-dove text-rust hover:text-rust hover:border-ink/60 hover:bg-fog/50 font-bold"
        onClick={() => onConfirm(reason || undefined)}
      >
        标记为他司成交
      </Button>
    </div>
  );
};

interface PendingVisitPanelProps {
  lead: Lead;
  onAudit: LeadAuditPanelProps["onAudit"];
  onEvalAdjusted?: (history: EvalHistory) => void;
}

const PendingVisitPanel: React.FC<PendingVisitPanelProps> = ({ lead, onAudit, onEvalAdjusted }) => (
  <div className="space-y-4">
    <CurrentEvalPriceSection lead={lead} onEvalAdjusted={onEvalAdjusted} />
    <div className="bg-fog border border-dove p-4 rounded-xl flex gap-3">
      <AlertTriangle className="h-5 w-5 text-graphite shrink-0" />
      <div className="space-y-1">
        <p className="text-xs font-bold text-ink">当前阶段：实勘核验</p>
        <p className="text-[11px] text-graphite leading-relaxed">
          请协调实勘人员在 48 小时内完成上门，重点核实房屋漏水、结构改动及物业欠费情况。
        </p>
      </div>
    </div>
    <Button
      className="w-full h-12 rounded-full bg-ink text-white hover:bg-ink/90 font-bold"
      onClick={() => onAudit(lead.id, LeadStatus.VISITED)}
    >
      确认已完成现场实勘
    </Button>
    <MarkLostSection
      onConfirm={(reason) => onAudit(lead.id, LeadStatus.LOST_TO_COMPETITOR, undefined, reason)}
    />
  </div>
);

interface VisitedPanelProps {
  lead: Lead;
  onAudit: LeadAuditPanelProps["onAudit"];
  onEvalAdjusted?: (history: EvalHistory) => void;
}

const VisitedPanel: React.FC<VisitedPanelProps> = ({ lead, onAudit, onEvalAdjusted }) => (
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
      className="w-full h-12 rounded-full bg-ink text-white hover:bg-ink/90 font-bold flex items-center gap-2"
      onClick={() => onAudit(lead.id, LeadStatus.SIGNED)}
    >
      <FileCheck className="h-4 w-4" /> 确认合同签署并收房
    </Button>
    <MarkLostSection
      onConfirm={(reason) => onAudit(lead.id, LeadStatus.LOST_TO_COMPETITOR, undefined, reason)}
    />
  </div>
);

const SignedPanel: React.FC = () => (
  <div className="text-center py-4">
    <div className="inline-flex h-12 w-12 rounded-full bg-emerald-100 text-success items-center justify-center mb-3">
      <CheckCircle2 className="h-6 w-6" />
    </div>
    <h4 className="font-black text-foreground">恭喜！已完成资产收储</h4>
    <p className="text-xs text-muted-foreground mt-1">该房源已进入&quot;工程翻新&quot;阶段</p>
  </div>
);

interface TerminalStatusPanelProps {
  title: string;
  description: string;
  reasonLabel?: string;
  auditReason?: string;
  auditTime?: string;
}

const TerminalStatusPanel: React.FC<TerminalStatusPanelProps> = ({
  title,
  description,
  reasonLabel,
  auditReason,
  auditTime,
}) => (
  <div className="bg-fog border border-dove p-4 rounded-xl space-y-1.5">
    <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">{title}</p>
    <p className="text-[11px] text-muted-foreground leading-relaxed">{description}</p>
    {auditReason && (
      <div className="pt-1 space-y-0.5">
        {reasonLabel && (
          <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">
            {reasonLabel}
          </p>
        )}
        <p className="text-sm italic text-muted-foreground">&quot;{auditReason}&quot;</p>
      </div>
    )}
    {auditTime && (
      <p className="text-[10px] font-bold text-muted-foreground pt-1 border-t border-dove">
        处理时间：{safeFormatDate(auditTime, "yyyy/MM/dd HH:mm:ss")}
      </p>
    )}
  </div>
);

interface RejectedPanelProps {
  auditReason?: string;
  auditTime?: string;
}

const RejectedPanel: React.FC<RejectedPanelProps> = ({ auditReason, auditTime }) => (
  <TerminalStatusPanel
    title="线索已放弃"
    description="该线索经评估后放弃跟进，不再进入后续约看与收房流程。"
    reasonLabel="放弃原因"
    auditReason={auditReason}
    auditTime={auditTime}
  />
);

const LostToCompetitorPanel: React.FC<RejectedPanelProps> = ({ auditReason, auditTime }) => (
  <TerminalStatusPanel
    title="线索已关闭"
    description="该房源已被其他公司成交，线索已关闭。"
    auditReason={auditReason}
    auditTime={auditTime}
  />
);
