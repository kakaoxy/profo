"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { CheckCircle2, FileCheck, Gavel, Target } from "lucide-react";
import { Lead, LeadStatus, EvalHistory } from "../../types";
import { createEvaluationAction } from "../../actions";
import { safeFormatDate } from "@/lib/formatters";
import { SaleDaysInput, ScorePicker } from "./verdict-inputs";

interface LeadAuditPanelProps {
  lead: Lead;
  onAudit: (leadId: string, status: LeadStatus, evalPrice?: number, reason?: string) => void;
  onOpenAssessment?: () => void;
  onEvalAdjusted?: () => void;
}

const decisionButtonClass =
  "h-9 rounded-full bg-ink px-4 text-[10.5px] font-[450] text-white hover:bg-black";
const secondaryLinkClass =
  "text-[10px] text-graphite underline underline-offset-2 transition-colors hover:text-rust";

export const LeadAuditPanel: React.FC<LeadAuditPanelProps> = ({
  lead,
  onAudit,
  onOpenAssessment,
  onEvalAdjusted,
}) => {
  return (
    <div className="overflow-hidden rounded-[14px] border border-dove/35 bg-pure-white">
      <div className="flex items-center gap-2 border-b border-dove/25 bg-fog px-3.5 py-2.5">
        <Gavel className="h-3.5 w-3.5 text-graphite" strokeWidth={1.7} />
        <span className="text-[9px] font-[600] uppercase tracking-[0.08em] text-graphite">
          管理决策终端
        </span>
      </div>
      <div className="space-y-3 px-3.5 py-3.5">
        {lead.status === LeadStatus.PENDING_ASSESSMENT && (
          <div className="space-y-3">
            <div className="rounded-[10px] bg-fog px-3 py-3">
              <p className="text-[10.5px] font-[500] text-ink">收房评估尚未完成</p>
              <p className="mt-1 text-[9.5px] leading-[1.6] text-ash">
                需依次填写房源条件分、装修后可售周期与拟收房评估价，三项齐全后才能批准约看排期。
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {onOpenAssessment && (
                <Button className={decisionButtonClass} onClick={onOpenAssessment}>
                  给出收房评估
                </Button>
              )}
              <button
                type="button"
                className={secondaryLinkClass}
                onClick={() => onAudit(lead.id, LeadStatus.REJECTED, undefined, undefined)}
              >
                评估不符 · 放弃
              </button>
            </div>
            <MarkLostSection
              onConfirm={(reason) =>
                onAudit(lead.id, LeadStatus.LOST_TO_COMPETITOR, undefined, reason)
              }
            />
          </div>
        )}

        {lead.status === LeadStatus.PENDING_VISIT && (
          <PendingVisitPanel lead={lead} onAudit={onAudit} onEvalAdjusted={onEvalAdjusted} />
        )}

        {lead.status === LeadStatus.VISITED && (
          <VisitedPanel lead={lead} onAudit={onAudit} onEvalAdjusted={onEvalAdjusted} />
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
      </div>
    </div>
  );
};

interface CurrentEvalPriceSectionProps {
  lead: Lead;
  onEvalAdjusted?: (history: EvalHistory) => void;
}

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
  const [submitting, setSubmitting] = useState(false);

  const adjustMissing = !newEvalPrice
    ? "新评估价"
    : adjustScore == null
      ? "房源条件分"
      : adjustDays == null
        ? "装修后可售周期"
        : null;

  const handleAdjustSubmit = async () => {
    if (submitting) return;
    if (adjustMissing) {
      setError(`请先填写${adjustMissing}`);
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
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
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-3 rounded-[10px] bg-fog px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <Target className="h-3.5 w-3.5 shrink-0 text-graphite" strokeWidth={1.7} />
          <span className="text-[10px] text-graphite">当前评估价</span>
          <span className="text-[12px] font-[500] tabular-nums text-ink">
            ¥{lead.evalPrice ?? "—"} 万
          </span>
        </div>
        <button
          type="button"
          className="shrink-0 text-[10px] text-graphite underline underline-offset-2 hover:text-ink"
          onClick={() => setShowAdjustForm((value) => !value)}
        >
          {showAdjustForm ? "收起" : "调整评估价"}
        </button>
      </div>
      {showAdjustForm && (
        <div className="mt-3 space-y-3 rounded-[12px] bg-fog p-3">
          <div className="space-y-1.5">
            <label className="ml-0.5 block text-[9.5px] text-graphite">
              房源条件分 <span className="text-rust">必填</span>
            </label>
            <ScorePicker value={adjustScore} onChange={setAdjustScore} />
          </div>
          <div className="space-y-1.5">
            <label className="ml-0.5 block text-[9.5px] text-graphite">
              装修后可售周期 <span className="text-rust">必填</span>
            </label>
            <SaleDaysInput value={adjustDays} onChange={setAdjustDays} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="ml-0.5 block text-[9.5px] text-graphite">新评估价 (万)</label>
              <input
                type="number"
                className="h-9 w-full rounded-[9px] border border-dove/50 bg-pure-white px-3 text-[11px] font-[500] tabular-nums text-ink outline-none focus:border-ink/50 focus:ring-2 focus:ring-ink/10"
                placeholder="输入新评估价..."
                value={newEvalPrice}
                onChange={(event) => setNewEvalPrice(Number(event.target.value))}
              />
            </div>
            <div className="space-y-1.5">
              <label className="ml-0.5 block text-[9.5px] text-graphite">调整说明</label>
              <input
                className="h-9 w-full rounded-[9px] border border-dove/50 bg-pure-white px-3 text-[11px] text-ink outline-none focus:border-ink/50 focus:ring-2 focus:ring-ink/10"
                placeholder="如：市场行情变化..."
                value={adjustReason}
                onChange={(event) => setAdjustReason(event.target.value)}
              />
            </div>
          </div>
          <p className="text-[9.5px] leading-[1.6] text-dove">
            调整将追加一条评估记录（不改线索状态）。评分与周期每次都要重填，避免沿用旧判断掩盖修正。
          </p>
          <div className="flex justify-end">
            <Button
              className="h-9 rounded-full bg-ink px-4 text-[10.5px] font-[450] text-white hover:bg-black"
              onClick={handleAdjustSubmit}
              disabled={adjustMissing != null || submitting}
            >
              {submitting ? "保存中..." : adjustMissing ? `还需填写${adjustMissing}` : "保存调整"}
            </Button>
          </div>
          {error && <p className="text-[10px] text-rust">{error}</p>}
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
    <div className="flex items-center gap-2 border-t border-dashed border-dove/30 pt-3">
      <input
        className="h-8 min-w-0 flex-1 rounded-full border border-dove/35 bg-pure-white px-3 text-[10px] text-ink outline-none focus:border-ink/40 focus:ring-2 focus:ring-ink/10"
        placeholder="原因（选填）"
        value={reason}
        onChange={(event) => setReason(event.target.value)}
      />
      <button
        type="button"
        className={secondaryLinkClass}
        onClick={() => onConfirm(reason || undefined)}
      >
        标记为他司成交
      </button>
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
  <div className="space-y-3">
    <CurrentEvalPriceSection lead={lead} onEvalAdjusted={onEvalAdjusted} />
    <div className="flex items-start justify-between gap-3 rounded-[10px] bg-sky-wash px-3 py-2.5">
      <div>
        <p className="text-[10.5px] font-[500] text-ink">当前阶段：实勘核验</p>
        <p className="mt-0.5 text-[9.5px] leading-[1.6] text-ash">
          请在 48 小时内完成上门实勘，重点核验漏水、结构改动及物业欠费。
        </p>
      </div>
      <span className="shrink-0 text-[10px] tabular-nums text-graphite">48h 内</span>
    </div>
    <div className="flex flex-wrap items-center gap-3">
      <Button
        className={decisionButtonClass}
        onClick={() => onAudit(lead.id, LeadStatus.VISITED)}
      >
        确认已完成现场实勘
      </Button>
      <button
        type="button"
        className={secondaryLinkClass}
        onClick={() => onAudit(lead.id, LeadStatus.LOST_TO_COMPETITOR)}
      >
        标记为他司成交
      </button>
    </div>
  </div>
);

interface VisitedPanelProps {
  lead: Lead;
  onAudit: LeadAuditPanelProps["onAudit"];
  onEvalAdjusted?: (history: EvalHistory) => void;
}

const VisitedPanel: React.FC<VisitedPanelProps> = ({ lead, onAudit, onEvalAdjusted }) => (
  <div className="space-y-3">
    <CurrentEvalPriceSection lead={lead} onEvalAdjusted={onEvalAdjusted} />
    <div className="rounded-[10px] bg-fog px-3 py-2.5">
      <p className="text-[10.5px] font-[500] text-ink">实勘通过 · 等待签约</p>
      <p className="mt-0.5 text-[9.5px] leading-[1.6] text-ash">
        实勘报告已归档，数据模型显示该房源具备 Flip 价值。请发起最终商务谈判。
      </p>
    </div>
    <div className="flex flex-wrap items-center gap-3">
      <Button
        className={decisionButtonClass}
        onClick={() => onAudit(lead.id, LeadStatus.SIGNED)}
      >
        <FileCheck className="mr-1.5 h-3.5 w-3.5" strokeWidth={1.7} />
        确认合同签署并收房
      </Button>
      <button
        type="button"
        className={secondaryLinkClass}
        onClick={() => onAudit(lead.id, LeadStatus.LOST_TO_COMPETITOR)}
      >
        标记为他司成交
      </button>
    </div>
  </div>
);

const SignedPanel: React.FC = () => (
  <div className="flex items-center gap-3 rounded-[10px] bg-fog px-3 py-3">
    <CheckCircle2 className="h-4 w-4 shrink-0 text-rust" strokeWidth={1.7} />
    <div>
      <p className="text-[10.5px] font-[500] text-ink">已完成资产收储</p>
      <p className="mt-0.5 text-[9.5px] text-ash">该房源已进入「工程翻新」阶段。</p>
    </div>
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
  <div className="space-y-1.5 rounded-[10px] bg-fog px-3 py-3">
    <p className="text-[9px] font-[600] uppercase tracking-[0.08em] text-graphite">{title}</p>
    <p className="text-[9.5px] leading-[1.6] text-ash">{description}</p>
    {auditReason && (
      <div className="space-y-0.5 pt-1">
        {reasonLabel && <p className="text-[9px] text-dove">{reasonLabel}</p>}
        <p className="text-[10.5px] italic text-graphite">&quot;{auditReason}&quot;</p>
      </div>
    )}
    {auditTime && (
      <p className="border-t border-dove/25 pt-1.5 text-[9px] text-dove">
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
    title="已标记为他司成交"
    description="该线索已转为他司成交，本团队不再跟进。"
    reasonLabel="成交原因"
    auditReason={auditReason}
    auditTime={auditTime}
  />
);
