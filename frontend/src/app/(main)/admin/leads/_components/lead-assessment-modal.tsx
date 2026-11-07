"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Loader2, Star, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatBuildingLabel } from "@/lib/dict-display";
import { safeFormatDate } from "@/lib/formatters";
import { daysSay, daysTierLabel, SCORE_ANCHORS, SCORE_LABELS } from "@/lib/lead-verdict";
import { Lead, LeadStatus } from "../types";
import { createEvaluationAction } from "../actions";
import { LEAD_STATUS_META } from "../_lib/lead-status-meta";
import { getFollowUpMethodShort } from "../_lib/follow-up-meta";

interface LeadAssessmentModalProps {
  lead: Lead | null;
  open: boolean;
  onClose: () => void;
  onAudit: (leadId: string, status: LeadStatus, evalPrice?: number, reason?: string) => Promise<boolean> | boolean;
}

const formatPrice = (value?: number | null): string => {
  if (value == null || Number.isNaN(value)) return "—";
  return value.toLocaleString("zh-CN");
};

const formatUnitPrice = (lead: Lead): string => {
  if (lead.unitPrice > 0) return `${lead.unitPrice.toLocaleString("zh-CN")} 万/㎡`;
  if (lead.totalPrice > 0 && lead.area > 0) return `${(lead.totalPrice / lead.area).toFixed(2)} 万/㎡`;
  return "—";
};

/**
 * 评估弹窗：按设计稿 04 实现。
 *
 * 业务口径完全沿用原 PendingAssessmentPanel：
 * 房源条件分、装修后可售周期、拟收房评估价三项必填；提交先创建评估记录，
 * 再推进到待看房；评估不符直接放弃且不创建评估记录。
 */
export const LeadAssessmentModal: React.FC<LeadAssessmentModalProps> = ({
  lead,
  open,
  onClose,
  onAudit,
}) => {
  const [mounted, setMounted] = useState(false);
  const [score, setScore] = useState<number | null>(null);
  const [days, setDays] = useState<number | "">("");
  const [price, setPrice] = useState<number | "">("");
  const [opinion, setOpinion] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // 评估记录已创建但状态流转失败时，重试只补状态，避免重复写入评估历史。
  const [evaluationSaved, setEvaluationSaved] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open || !lead) return;
    setScore(lead.conditionScore ?? null);
    setDays(lead.expectedSaleDays ?? "");
    setPrice(lead.evalPrice ?? "");
    setOpinion("");
    setError(null);
    setSubmitting(false);
    setEvaluationSaved(false);
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open, lead]);

  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !submitting) onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose, submitting]);

  if (!mounted || !open || !lead) return null;

  const statusMeta = LEAD_STATUS_META[lead.status];
  const missing: string[] = [];
  if (score == null) missing.push("房源条件分");
  if (days === "" || Number(days) <= 0) missing.push("装修后可售周期");
  if (price === "" || Number(price) <= 0) missing.push("拟收房评估价");
  const ready = missing.length === 0;
  const daysValue = days === "" ? null : Number(days);
  const unitPrice = formatUnitPrice(lead);
  const addressLine = [
    lead.buildingNo ? formatBuildingLabel(lead.buildingNo) : "",
    lead.roomNo ? `${lead.roomNo}室` : "",
  ]
    .filter(Boolean)
    .join(" ");
  const communityLine = [addressLine, lead.district, lead.businessArea].filter(Boolean).join(" · ");

  const handleApprove = async () => {
    if (submitting) return;
    if (!ready) {
      setError(`请先填写${missing.join("、")}`);
      return;
    }
    setError(null);
    setSubmitting(true);
    if (!evaluationSaved) {
      const result = await createEvaluationAction(
        lead.id,
        Number(price),
        Number(score),
        Number(days),
        opinion || undefined,
      );
      if (!result.success) {
        setSubmitting(false);
        setError(result.error);
        return;
      }
      setEvaluationSaved(true);
    }
    const audited = await onAudit(
      lead.id,
      LeadStatus.PENDING_VISIT,
      Number(price),
      opinion || undefined,
    );
    setSubmitting(false);
    if (!audited) {
      setError("评估已保存，但线索状态更新失败，请重试");
      return;
    }
    onClose();
  };

  const handleReject = async () => {
    if (submitting) return;
    setSubmitting(true);
    const audited = await onAudit(lead.id, LeadStatus.REJECTED, undefined, opinion || undefined);
    setSubmitting(false);
    if (!audited) {
      setError("线索状态更新失败，请重试");
      return;
    }
    onClose();
  };

  const handleLost = async () => {
    if (submitting) return;
    if (!window.confirm("确认将该线索标记为他司成交？")) return;
    setSubmitting(true);
    const audited = await onAudit(
      lead.id,
      LeadStatus.LOST_TO_COMPETITOR,
      undefined,
      opinion || undefined,
    );
    setSubmitting(false);
    if (!audited) {
      setError("线索状态更新失败，请重试");
      return;
    }
    onClose();
  };

  return createPortal(
    // Radix Sheet 打开时会给 body 设置 pointer-events:none；portal 到 body 的弹窗需显式恢复，
    // 否则按钮可见但点击会穿透到 sheet-overlay。
    <div className="pointer-events-auto fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-7">
      <button
        type="button"
        aria-label="关闭评估弹窗"
        className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]"
        onClick={() => {
          if (!submitting) onClose();
        }}
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="assessment-modal-title"
        className="relative flex max-h-[calc(100vh-32px)] w-full max-w-[960px] flex-col overflow-hidden rounded-cards bg-pure-white shadow-[0_40px_100px_-36px_rgba(0,0,0,.55),rgba(4,23,43,.08)_0_0_0_1px] sm:max-h-[calc(100vh-56px)]"
      >
        <header className="flex shrink-0 items-start justify-between gap-6 border-b border-dove/30 px-5 py-5 sm:px-[26px] sm:py-[21px]">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-[9.5px] text-dove">
              <span
                className={cn(
                  "inline-flex h-5 items-center rounded-full px-2 text-[9px] font-medium",
                  statusMeta.badgeClass,
                )}
              >
                {statusMeta.label}
              </span>
              <span className="h-[2px] w-[2px] rounded-full bg-dove" />
              <span className="font-mono text-[9px] tracking-normal text-graphite">
                LD-{lead.id.slice(0, 8).toUpperCase()}
              </span>
              <span className="h-[2px] w-[2px] rounded-full bg-dove" />
              <span className="truncate">{communityLine || lead.communityName}</span>
            </div>
            <h1
              id="assessment-modal-title"
              className="mt-2 text-[27px] font-[480] leading-[1.15] tracking-[-0.03em] text-ink"
            >
              给出收房评估
            </h1>
            <p className="mt-1.5 text-[11.5px] text-graphite">
              一次填完「好不好、多久、多少钱」，提交后生成评估记录并批准约看。
            </p>
          </div>
          <button
            type="button"
            aria-label="关闭"
            disabled={submitting}
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-graphite transition-colors hover:bg-fog hover:text-ink disabled:opacity-40"
          >
            <X className="h-[17px] w-[17px]" strokeWidth={1.8} />
          </button>
        </header>

        <div className="grid min-h-0 flex-1 overflow-y-auto md:grid-cols-[318px_minmax(0,1fr)] md:overflow-hidden">
          <aside className="border-b border-dove/30 bg-fog px-[22px] pb-6 pt-[22px] md:overflow-y-auto md:border-b-0 md:border-r">
            <div className="flex items-center gap-[11px]">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] bg-apricot-wash font-display text-[16px] font-[500] text-rust">
                {lead.communityName.charAt(0)}
              </div>
              <div className="min-w-0">
                <div className="truncate text-[16px] font-[500] tracking-[-0.02em] text-ink">
                  {lead.communityName}
                </div>
                <div className="mt-0.5 truncate text-[10px] text-graphite">
                  {[addressLine, lead.district, lead.businessArea].filter(Boolean).join(" · ")}
                </div>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-2 border-t border-dove/30">
              <div className="pt-3.5">
                <div className="text-[9.5px] text-dove">业主报价</div>
                <div className="mt-0.5 text-[19px] font-[480] leading-[1.1] tracking-[-0.02em] text-ink tabular-nums">
                  {lead.totalPrice > 0 ? formatPrice(lead.totalPrice) : "—"}
                  {lead.totalPrice > 0 ? (
                    <small className="ml-0.5 text-[9.5px] font-[400] text-graphite">万</small>
                  ) : null}
                </div>
                <div className="mt-1 text-[9px] text-dove">{unitPrice}</div>
              </div>
              <div className="border-l border-dove/30 pl-4 pt-3.5">
                <div className="text-[9.5px] text-dove">当前评估价</div>
                <div
                  className={cn(
                    "mt-0.5 text-[14px]",
                    lead.evalPrice ? "font-[480] text-ink" : "text-dove",
                  )}
                >
                  {lead.evalPrice != null ? `${formatPrice(lead.evalPrice)} 万` : "待评估"}
                </div>
                <div className="mt-1 text-[9px] text-dove">本次给出授权价</div>
              </div>
              <div className="mt-3.5 border-t border-dove/30 pt-3.5">
                <div className="text-[9.5px] text-dove">面积 / 户型</div>
                <div className="mt-0.5 text-[19px] font-[480] leading-[1.1] tracking-[-0.02em] text-ink tabular-nums">
                  {lead.area || "—"}
                  <small className="ml-0.5 text-[9.5px] font-[400] text-graphite">㎡</small>
                </div>
                <div className="mt-1 text-[9px] text-dove">
                  {[lead.layout, lead.floorInfo].filter(Boolean).join(" · ") || "—"}
                </div>
              </div>
              <div className="mt-3.5 border-l border-dove/30 pl-4 pt-3.5">
                <div className="text-[9.5px] text-dove">当前状态</div>
                <div className="mt-0.5 text-[14px] font-[480] text-rust">{statusMeta.label}</div>
                <div className="mt-1 text-[9px] text-dove">等待给出结论</div>
              </div>
            </div>

            {(lead.expectedPrice != null || lead.remarks) && (
              <div className="mt-[22px] border-t border-dove/30 pt-[17px]">
                <div className="flex items-baseline justify-between gap-2 text-[10px] font-[500] text-graphite">
                  业主补充信息
                  <span className="text-[8.5px] font-[400] text-dove">C 端提交评估时填写</span>
                </div>
                {lead.expectedPrice != null && (
                  <div className="mt-2 inline-flex h-[23px] items-center rounded-full bg-apricot-wash px-2.5 text-[10px] font-[500] text-rust">
                    心理预期价 ¥{formatPrice(lead.expectedPrice)} 万
                  </div>
                )}
                {lead.remarks && (
                  <p className="mt-2 rounded-r-[8px] border-l-2 border-apricot-edge bg-pure-white px-3 py-2 text-[10.5px] italic leading-[1.65] text-ash">
                    “{lead.remarks}”
                  </p>
                )}
              </div>
            )}

            <p className="mt-[18px] text-[9.5px] leading-[1.65] text-dove">
              评估三项会同步到 C 端结论和小程序卡片，请按实勘结果填写；三项齐全后才可提交。
            </p>
            {lead.latestFollowUp && (
              <div className="mt-[18px] border-t border-dove/30 pt-[15px] text-[9px] leading-[1.6] text-dove">
                <b className="font-[450] text-graphite">
                  最近跟进 · {safeFormatDate(lead.latestFollowUp.followedAt, "MM-dd HH:mm")}
                </b>
                <br />
                {lead.latestFollowUp.createdByName || lead.ownerEmployeeName || "—"} ·{" "}
                {getFollowUpMethodShort(lead.latestFollowUp.method)}：{lead.latestFollowUp.content}
              </div>
            )}
          </aside>

          <section className="flex min-h-0 flex-col px-5 pb-5 pt-[21px] sm:px-[26px] sm:pb-5">
            <div className="flex shrink-0 items-baseline justify-between gap-3">
              <h2 className="text-[13px] font-[500] text-ink">评估录入</h2>
              <span className="text-[9px] text-dove">3 项必填</span>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto pr-1 md:pr-0">
              <div className="mt-[18px]">
                <div className="flex items-baseline gap-[7px]">
                  <span className="font-mono text-[9px] text-dove">01</span>
                  <span className="text-[11px] font-[500] text-ink">房源条件分</span>
                  <span className="text-[8.5px] text-rust">必填</span>
                  <span className="ml-auto text-[9px] text-dove">判断好不好</span>
                </div>
                <div className="mt-[9px] flex items-center gap-1.5">
                  {[1, 2, 3, 4, 5].map((value) => {
                    const on = score != null && value <= score;
                    return (
                      <button
                        key={value}
                        type="button"
                        aria-label={`${value} 分 ${SCORE_LABELS[value as 1 | 2 | 3 | 4 | 5]}`}
                        aria-pressed={score === value}
                        onClick={() => setScore(value)}
                        disabled={evaluationSaved || submitting}
                        className={cn(
                          "flex h-9 w-[38px] items-center justify-center rounded-[11px] border transition-colors",
                          on
                            ? "border-ink bg-ink text-white"
                            : "border-dove/30 bg-pure-white text-dove hover:border-dove hover:text-graphite",
                        )}
                      >
                        <Star className={cn("h-4 w-4", on && "fill-current")} strokeWidth={1.8} />
                      </button>
                    );
                  })}
                  <span
                    className={cn(
                      "ml-1.5 text-[12px] font-[500]",
                      score == null ? "text-ash" : "text-ink",
                    )}
                  >
                    {score == null
                      ? "未评分"
                      : `${score} 分 · ${SCORE_LABELS[score as 1 | 2 | 3 | 4 | 5]}`}
                  </span>
                </div>
                <p className="mt-[7px] text-[9.5px] leading-[1.45] text-graphite">
                  {score == null
                    ? "按户型、采光、楼层、产权四项综合打分；4 分为主流户型，有 1 项需在带看时说明的短板。"
                    : SCORE_ANCHORS[score as 1 | 2 | 3 | 4 | 5]}
                </p>
              </div>

              <div className="mt-[18px]">
                <div className="flex items-baseline gap-[7px]">
                  <span className="font-mono text-[9px] text-dove">02</span>
                  <span className="text-[11px] font-[500] text-ink">装修后可售周期</span>
                  <span className="text-[8.5px] text-rust">必填</span>
                  <span className="ml-auto text-[9px] text-dove">判断多久</span>
                </div>
                <div className="mt-[9px] flex h-[46px] items-center gap-2 rounded-[13px] border border-dove/30 bg-pure-white px-3.5 focus-within:border-ink focus-within:ring-[3px] focus-within:ring-ink/[0.07]">
                  <span className="text-[11px] text-graphite">约</span>
                  <input
                    type="number"
                    min={1}
                    max={365}
                    inputMode="numeric"
                    value={days}
                    onChange={(event) =>
                      setDays(event.target.value === "" ? "" : Number(event.target.value))
                    }
                    disabled={evaluationSaved || submitting}
                    aria-label="装修后可售天数"
                    className="min-w-0 flex-1 border-0 bg-transparent text-[24px] font-[480] tabular-nums tracking-[-0.02em] text-ink outline-none"
                  />
                  <span className="shrink-0 text-[11px] text-graphite">天</span>
                </div>
                <div className="mt-[7px] flex items-center gap-2 text-[9.5px] text-graphite">
                  <span className="inline-flex h-5 items-center rounded-full bg-apricot-wash px-2 text-[9px] font-[500] text-rust">
                    {daysValue ? daysTierLabel(daysValue) : "周期待填"}
                  </span>
                  <span>{daysValue ? daysSay(daysValue) : "填写后自动生成档位与月份"}</span>
                </div>
              </div>

              <div className="mt-[18px]">
                <div className="flex items-baseline gap-[7px]">
                  <span className="font-mono text-[9px] text-dove">03</span>
                  <span className="text-[11px] font-[500] text-ink">拟收房评估价</span>
                  <span className="text-[8.5px] text-rust">必填</span>
                  <span className="ml-auto text-[9px] text-dove">判断多少钱</span>
                </div>
                <div className="mt-[9px] flex h-[46px] items-center gap-2 rounded-[13px] border border-dove/30 bg-pure-white px-3.5 focus-within:border-ink focus-within:ring-[3px] focus-within:ring-ink/[0.07]">
                  <span className="text-[11px] text-graphite">¥</span>
                  <input
                    type="number"
                    min={0}
                    value={price}
                    onChange={(event) =>
                      setPrice(event.target.value === "" ? "" : Number(event.target.value))
                    }
                    disabled={evaluationSaved || submitting}
                    aria-label="拟收房评估价"
                    className="min-w-0 flex-1 border-0 bg-transparent text-[24px] font-[480] tabular-nums tracking-[-0.02em] text-ink outline-none"
                  />
                  <span className="shrink-0 text-[11px] text-graphite">万</span>
                </div>
                <p className="mt-[7px] text-[9.5px] text-dove">
                  提交后作为当前授权评估价，写入评估历史；不改变业主报价。
                </p>
              </div>

              <div className="mt-[18px]">
                <div className="flex items-baseline gap-[7px]">
                  <span className="font-mono text-[9px] text-dove">04</span>
                  <span className="text-[11px] font-[500] text-ink">评估意见摘要</span>
                  <span className="ml-auto text-[9px] text-dove">选填 · 会同步给 C 端</span>
                </div>
                <div className="mt-[9px] rounded-[13px] border border-dove/30 bg-pure-white px-3 py-2.5 focus-within:border-ink focus-within:ring-[3px] focus-within:ring-ink/[0.07]">
                  <textarea
                    value={opinion}
                    onChange={(event) => setOpinion(event.target.value)}
                    placeholder="如：同户型近三月成交均价 7.4 万/㎡，装修中等，按 7.42 万/㎡ 给出。"
                    className="block min-h-[52px] w-full resize-none border-0 bg-transparent text-[10.5px] leading-[1.65] text-ash outline-none placeholder:text-dove"
                  />
                </div>
              </div>

              {ready ? (
                <div className="mt-4 flex items-start gap-2 rounded-[12px] bg-fog px-3 py-2.5 text-[9.5px] leading-[1.5] text-graphite">
                  <span className="mt-[5px] h-[5px] w-[5px] shrink-0 rounded-full bg-rust" />
                  <span>
                    <b className="font-[500] text-ink">三项齐全，可提交。</b>{" "}
                    提交后会生成一条评估记录，并将线索推进到待看房阶段。
                  </span>
                </div>
              ) : (
                <div className="mt-4 flex items-start gap-2 rounded-[12px] bg-[#fdf4ee] px-3 py-2.5 text-[9.5px] leading-[1.5] text-rust">
                  <span className="mt-[5px] h-[5px] w-[5px] shrink-0 rounded-full bg-rust" />
                  <span>
                    <b className="font-[500]">还需填写：{missing.join("、")}</b>
                  </span>
                </div>
              )}
              {error && <p className="mt-2 text-[11px] text-error">{error}</p>}
            </div>

            <footer className="mt-3 flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-dove/30 pt-3.5">
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={handleReject}
                  className="text-[10px] text-rust transition-colors hover:text-ink"
                >
                  评估不符 · 放弃
                </button>
                <button
                  type="button"
                  onClick={handleLost}
                  className="text-[10px] text-graphite transition-colors hover:text-ink"
                >
                  标记为他司成交
                </button>
              </div>
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={onClose}
                  className="h-[38px] rounded-full px-4 text-[10.5px] text-graphite transition-colors hover:bg-fog hover:text-ink"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleApprove}
                  disabled={!ready || submitting}
                  className="inline-flex h-10 items-center gap-1.5 rounded-full bg-ink px-5 text-[10.5px] font-[500] text-white transition-colors hover:bg-[#2a2e33] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {submitting ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Check className="h-3.5 w-3.5" />
                  )}
                  {submitting ? "提交中..." : "批准约看排期"}
                </button>
              </div>
            </footer>
          </section>
        </div>
      </section>
    </div>,
    document.body,
  );
};
