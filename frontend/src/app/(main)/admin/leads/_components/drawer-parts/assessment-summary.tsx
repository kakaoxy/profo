"use client";

import React, { useEffect, useState } from "react";
import { CheckCircle2, Clock3, Sparkles, Star, Target } from "lucide-react";
import { Lead, LeadStatus, type EvalHistory } from "../../types";
import { getEvalHistoriesAction } from "../../actions";
import { EvalHistoryList } from "./eval-history-list";
import { Stars } from "./verdict-badges";
import { daysSummary, daysTierLabel, SCORE_LABELS } from "@/lib/lead-verdict";

interface AssessmentSummaryProps {
  lead: Lead;
  refreshKey?: number;
  onOpenAssessment?: () => void;
}

/** 评估结论：把「好不好、多久、多少钱」放在一个可扫读的模块里。 */
export const AssessmentSummary: React.FC<AssessmentSummaryProps> = ({
  lead,
  refreshKey,
  onOpenAssessment,
}) => {
  const [latest, setLatest] = useState<EvalHistory | undefined>(lead.evalHistories?.[0]);

  useEffect(() => {
    setLatest(lead.evalHistories?.[0]);
    if (lead.evalHistories?.length) return;
    getEvalHistoriesAction(lead.id).then((result) => {
      if (result.success && result.data.length > 0) setLatest(result.data[0]);
    });
  }, [lead.id, lead.evalHistories, refreshKey]);

  const hasEval = lead.evalPrice != null;
  const isPending = lead.status === LeadStatus.PENDING_ASSESSMENT;

  if (!hasEval && !isPending) {
    return null;
  }

  return (
    <section className="space-y-2.5">
      <div className="flex items-center justify-between">
        <h3 className="text-[12px] font-[500] text-ink">评估结论</h3>
        <span className="text-[10px] text-dove">
          {latest?.evaluatedAt ? `最近更新 ${latest.evaluatedAt.slice(0, 10)}` : "—"}
        </span>
      </div>

      {hasEval ? (
        <>
          <div className="rounded-[16px] bg-fog px-5 py-4">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white text-rust">
                <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2} />
              </span>
              <span className="text-[12px] font-[500] text-ink">收房评估已通过</span>
              <span className="ml-auto text-[9.5px] text-dove">
                {latest?.evaluatorName || "—"} · {latest?.evaluatedAt?.slice(0, 16).replace("T", " ") || "—"}
              </span>
            </div>
            <div className="mt-3 grid grid-cols-3 divide-x divide-dove/25">
              <div className="pr-3">
                <div className="flex items-center gap-1 text-[9.5px] text-graphite">
                  <Target className="h-3 w-3" /> 授权评估价
                </div>
                <div className="mt-1 text-[20px] font-[480] tracking-[-0.02em] text-rust tabular-nums">
                  {lead.evalPrice!.toLocaleString("zh-CN")}
                  <small className="ml-0.5 text-[9px] font-normal text-rust/65">万</small>
                </div>
              </div>
              <div className="px-3">
                <div className="flex items-center gap-1 text-[9.5px] text-graphite">
                  <Sparkles className="h-3 w-3" /> 房源条件分
                </div>
                <div className="mt-1 flex items-baseline gap-1.5 text-rust">
                  <span className="text-[16px] font-[480] tabular-nums">
                    {(latest?.conditionScore ?? lead.conditionScore) != null
                      ? `${latest?.conditionScore ?? lead.conditionScore}.0`
                      : "—"}
                  </span>
                  <Stars score={latest?.conditionScore ?? lead.conditionScore} size="sm" />
                  <span className="text-[9px] text-rust/65">
                    {(latest?.conditionScore ?? lead.conditionScore) != null
                      ? SCORE_LABELS[
                          (latest?.conditionScore ?? lead.conditionScore) as 1 | 2 | 3 | 4 | 5
                        ]
                      : "未评分"}
                  </span>
                </div>
              </div>
              <div className="pl-3">
                <div className="flex items-center gap-1 text-[9.5px] text-graphite">
                  <Clock3 className="h-3 w-3" /> 装修后可售周期
                </div>
                <div className="mt-1 text-[16px] font-[480] text-rust tabular-nums">
                  {(latest?.expectedSaleDays ?? lead.expectedSaleDays) != null
                    ? `${latest?.expectedSaleDays ?? lead.expectedSaleDays} 天`
                    : "—"}
                  <span className="ml-1 text-[9px] font-normal text-rust/65">
                    {(latest?.expectedSaleDays ?? lead.expectedSaleDays) != null
                      ? `${daysTierLabel(latest?.expectedSaleDays ?? lead.expectedSaleDays!)} · ${daysSummary(
                          latest?.expectedSaleDays ?? lead.expectedSaleDays,
                        )}`
                      : "周期待补"}
                  </span>
                </div>
              </div>
            </div>
            {latest?.remark ? (
              <p className="mt-3 border-t border-dove/20 pt-2.5 text-[10px] leading-relaxed text-graphite">
                <Star className="mr-1 inline h-2.5 w-2.5 fill-rust text-rust" />
                {latest.remark}
              </p>
            ) : null}
          </div>
          <EvalHistoryList leadId={lead.id} initialHistories={lead.evalHistories} refreshKey={refreshKey} />
        </>
      ) : (
        <button
          type="button"
          onClick={onOpenAssessment}
          className="w-full rounded-[16px] border border-dashed border-apricot-edge bg-apricot-wash/40 px-5 py-5 text-left transition-colors hover:bg-apricot-wash/70"
        >
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-[13px] font-[500] text-rust">收房评估尚未完成</div>
              <p className="mt-1 text-[10.5px] leading-relaxed text-graphite">
                需依次填写房源条件分、装修后可售周期与拟收房评估价，三项齐全后才能批准约看排期。
              </p>
            </div>
            <span className="shrink-0 rounded-full bg-ink px-4 py-2 text-[11px] font-[500] text-white">
              给出收房评估
            </span>
          </div>
        </button>
      )}
    </section>
  );
};
