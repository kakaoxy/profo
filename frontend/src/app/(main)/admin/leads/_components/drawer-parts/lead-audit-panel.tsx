"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Gavel, AlertTriangle, CheckCircle2, FileCheck, Target } from "lucide-react";
import { Lead, LeadStatus, EvalHistory } from "../../types";
import { createEvaluationAction } from "../../actions";
import { safeFormatDate } from "@/lib/formatters";
import { EvalHistoryList } from "./eval-history-list";
import { SaleDaysInput, ScorePicker } from "./verdict-inputs";

interface LeadAuditPanelProps {
  lead: Lead;
  onAudit: (leadId: string, status: LeadStatus, evalPrice?: number, reason?: string) => void;
}

export const LeadAuditPanel: React.FC<LeadAuditPanelProps> = ({ lead, onAudit }) => {
  const [auditReason, setAuditReason] = useState("");
  const [evalPrice, setEvalPrice] = useState<number | "">("");
  const [conditionScore, setConditionScore] = useState<number | null>(null);
  const [expectedSaleDays, setExpectedSaleDays] = useState<number | null>(null);
  const [evalRefreshKey, setEvalRefreshKey] = useState<number>(0);

  const handleEvalAdjusted = () => {
    setEvalRefreshKey((v) => v + 1);
  };

  const showEvalHistory =
    lead.status !== LeadStatus.PENDING_ASSESSMENT &&
    lead.status !== LeadStatus.REJECTED &&
    lead.status !== LeadStatus.LOST_TO_COMPETITOR;

  return (
    <div className="bg-white rounded-cards shadow-steep overflow-hidden">
      <div className="p-4 border-b border-dove bg-fog flex items-center gap-2">
        <Gavel className="h-4 w-4 text-graphite" />
        <span className="text-[10px] font-black uppercase tracking-widest text-graphite">
          管理决策终端
        </span>
      </div>
      <div className="p-6 space-y-6">
        {lead.status === LeadStatus.PENDING_ASSESSMENT && (
          <PendingAssessmentPanel
            lead={lead}
            evalPrice={evalPrice}
            auditReason={auditReason}
            conditionScore={conditionScore}
            expectedSaleDays={expectedSaleDays}
            onEvalPriceChange={setEvalPrice}
            onConditionScoreChange={setConditionScore}
            onExpectedSaleDaysChange={setExpectedSaleDays}
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
  conditionScore: number | null;
  expectedSaleDays: number | null;
  onEvalPriceChange: (value: number | "") => void;
  onConditionScoreChange: (value: number | null) => void;
  onExpectedSaleDaysChange: (value: number | null) => void;
  onAuditReasonChange: (value: string) => void;
  onAudit: LeadAuditPanelProps["onAudit"];
}

const PendingAssessmentPanel: React.FC<PendingAssessmentPanelProps> = ({
  lead,
  evalPrice,
  auditReason,
  conditionScore,
  expectedSaleDays,
  onEvalPriceChange,
  onConditionScoreChange,
  onExpectedSaleDaysChange,
  onAuditReasonChange,
  onAudit,
}) => {
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // 三项齐全才允许提交：评估反馈必须是一份完整结论（好不好 / 多久 / 多少钱），
  // 缺任一项会重现「只有价格、员工客户都没有感知」的旧问题
  const missingField = !evalPrice
    ? "评估价"
    : conditionScore == null
      ? "房源条件分"
      : expectedSaleDays == null
        ? "装修后可售周期"
        : null;
  const canSubmit = missingField === null;

  // 批准约看排期：先创建评估记录，成功后再流转状态
  const handleApprove = async () => {
    setError(null);
    if (!canSubmit) {
      setError(`请先填写${missingField}`);
      return;
    }
    setSubmitting(true);
    const result = await createEvaluationAction(
      lead.id,
      Number(evalPrice),
      Number(conditionScore),
      Number(expectedSaleDays),
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
      {/* ① 房源条件分（判断由粗到细：好不好 → 多久 → 多少钱） */}
      <div className="space-y-1.5">
        <label className="text-[10px] font-black text-graphite uppercase ml-1">
          ① 房源条件分 <span className="text-rust">必填</span>
        </label>
        <ScorePicker
          value={conditionScore}
          onChange={onConditionScoreChange}
          disabled={submitting}
        />
      </div>

      {/* ② 装修后可售周期 */}
      <div className="space-y-1.5">
        <label className="text-[10px] font-black text-graphite uppercase ml-1">
          ② 装修后可售周期 <span className="text-rust">必填</span>
          <span className="ml-2 font-sans text-[10px] normal-case tracking-normal text-dove">
            预计从收房完成到售出的天数
          </span>
        </label>
        <SaleDaysInput
          value={expectedSaleDays}
          onChange={onExpectedSaleDaysChange}
          disabled={submitting}
        />
      </div>

      {/* ③ 评估价 + 评估意见 */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-[10px] font-black text-graphite uppercase ml-1">
            ③ 拟收房评估价 (万) <span className="text-rust">必填</span>
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
          <label className="text-[10px] font-black text-graphite uppercase ml-1">
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

      {/* 缺项提示（三者齐全才可提交） */}
      {missingField && !error && (
        <p className="rounded-inputs bg-fog px-3 py-2 text-[11px] text-graphite">
          还需填写：<span className="font-medium text-rust">{missingField}</span>
          ，三项齐全后可提交 —— 不允许产出「只有价格」的评估反馈。
        </p>
      )}
      {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
      <div className="grid grid-cols-2 gap-3">
        <Button
          className="h-12 rounded-full bg-ink text-white hover:bg-ink/90 font-bold"
          onClick={handleApprove}
          disabled={submitting || !canSubmit}
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
        onConfirm={(reason) => onAudit(lead.id, LeadStatus.LOST_TO_COMPETITOR, undefined, reason)}
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
  const [adjustScore, setAdjustScore] = useState<number | null>(null);
  const [adjustDays, setAdjustDays] = useState<number | null>(null);
  const [adjustReason, setAdjustReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Q1 口径 (a)：调整评估价必须重填评分与可售周期。
  // 调整往往正因为「楼层看错了」或「行情变了」，沿用旧评分会掩盖修正。
  const adjustMissing = !newEvalPrice
    ? "新评估价"
    : adjustScore == null
      ? "房源条件分"
      : adjustDays == null
        ? "装修后可售周期"
        : null;

  const handleAdjustSubmit = async () => {
    if (adjustMissing) {
      setError(`请先填写${adjustMissing}`);
      return;
    }
    setError(null);
    const result = await createEvaluationAction(
      lead.id,
      Number(newEvalPrice),
      Number(adjustScore),
      Number(adjustDays),
      adjustReason || undefined,
    );
    if (result.success) {
      setShowAdjustForm(false);
      setNewEvalPrice("");
      setAdjustScore(null);
      setAdjustDays(null);
      setAdjustReason("");
      onEvalAdjusted?.(result.data);
    } else {
      setError(result.error);
    }
  };

  return (
    <div>
      <div className="bg-emerald-50 border border-emerald-100 rounded-inputs p-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-emerald-600" />
          <span className="text-xs text-graphite">当前评估价</span>
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
        <div className="mt-3 space-y-3 p-3 bg-fog rounded-inputs">
          <div className="space-y-1.5">
            <label className="text-xs font-black text-graphite uppercase ml-1">
              房源条件分 <span className="text-rust">必填</span>
            </label>
            <ScorePicker value={adjustScore} onChange={setAdjustScore} />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-black text-graphite uppercase ml-1">
              装修后可售周期 <span className="text-rust">必填</span>
            </label>
            <SaleDaysInput value={adjustDays} onChange={setAdjustDays} />
          </div>
          <div className="grid grid-cols-2 gap-3">
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
          </div>
          <p className="text-[11px] leading-relaxed text-graphite">
            调整将追加一条评估记录（不改线索状态）。评分与周期每次都要重填 ——
            调整往往正因为「楼层看错了」或「行情变了」，沿用旧评分会掩盖修正。
          </p>
          <Button
            className="w-full h-11 rounded-full bg-ink text-white hover:bg-ink/90 font-bold"
            onClick={handleAdjustSubmit}
            disabled={adjustMissing != null}
          >
            {adjustMissing ? `还需填写${adjustMissing}` : "保存调整"}
          </Button>
          {error && <p className="text-xs text-red-500">{error}</p>}
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
    <div className="bg-fog p-4 rounded-inputs flex gap-3">
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
    <div className="bg-success-container border border-emerald-100 p-4 rounded-inputs flex gap-3">
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
    <h4 className="font-black text-ink">恭喜！已完成资产收储</h4>
    <p className="text-xs text-graphite mt-1">该房源已进入&quot;工程翻新&quot;阶段</p>
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
  <div className="bg-fog p-4 rounded-inputs space-y-1.5">
    <p className="text-xs font-bold text-graphite uppercase tracking-widest">{title}</p>
    <p className="text-[11px] text-graphite leading-relaxed">{description}</p>
    {auditReason && (
      <div className="pt-1 space-y-0.5">
        {reasonLabel && (
          <p className="text-[10px] font-black text-graphite uppercase tracking-widest">
            {reasonLabel}
          </p>
        )}
        <p className="text-sm italic text-graphite">&quot;{auditReason}&quot;</p>
      </div>
    )}
    {auditTime && (
      <p className="text-[10px] font-bold text-graphite pt-1 border-t border-dove">
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
