"use client";

import { useState } from "react";
import { Calculator, Star } from "lucide-react";
import { toast } from "sonner";
import { cLocale } from "@/lib/i18n/c-locale";
import { daysSay, scoreLabel, scoreStars } from "@/lib/lead-verdict";

/** 评估人简要信息（与后端 PublicEvaluatorBrief 对齐） */
export interface EvaluatorBrief {
  /** 后端字段为可选（Pydantic 默认 None），故此处用可选以对齐生成类型 */
  nickname?: string | null;
  phone_masked?: string | null;
  evaluated_at: string;
}

interface SystemEstimateCardProps {
  evalPrice: number | null;
  /** 房源条件分 1-5；存量记录为 null（显式降级为「未评分」） */
  conditionScore?: number | null;
  /** 装修后预计可售天数；存量记录为 null（显式降级为「周期待补」） */
  expectedSaleDays?: number | null;
  /** 最新一条评估的评估人；无评估为 null */
  evaluator?: EvaluatorBrief | null;
  createdAt: string;
  /** 点「拨打电话」：父级负责拉真实号 → tel: → 上报留痕 */
  onContactEvaluator?: () => void | Promise<void>;
}

/**
 * C 端评估结论卡.
 *
 * 迭代要点（相对旧版「只有一个 44px 大数字」）：
 * 1. **结论前置**：价格下方给一句 serif 人话结论（把评分与周期翻译成一句判断），
 *    客户读完句子就懂，不需要自己把三个数字拼起来；
 * 2. **双指标佐证**：评分星级 + 可售周期（永远附带「约 N 个月」翻译，不给裸天数）；
 * 3. **可追问**：评估人条 + 拨号，让「对这个数字有疑问」有出口 —— 反馈链路不再断在价格处。
 *
 * 纪律：存量线索（无评分/无周期）**不渲染**双指标区，也不显示「暂无数据」空壳；
 * 评估人无手机号时按钮不渲染（不留死链）。
 */
export function SystemEstimateCard({
  evalPrice,
  conditionScore,
  expectedSaleDays,
  evaluator,
  createdAt,
  onContactEvaluator,
}: SystemEstimateCardProps) {
  const [contacting, setContacting] = useState(false);

  const hasScore = conditionScore != null && conditionScore >= 1 && conditionScore <= 5;
  const hasDays = expectedSaleDays != null && expectedSaleDays > 0;
  const hasMetrics = hasScore || hasDays;
  const filled = scoreStars(hasScore ? conditionScore : null);

  const handleContact = async () => {
    if (!onContactEvaluator || contacting) return;
    setContacting(true);
    try {
      await onContactEvaluator();
    } finally {
      setContacting(false);
    }
  };

  return (
    <div className="rounded-cards bg-apricot-wash p-6 border border-apricot-wash">
      {/* 头部 */}
      <div className="flex items-center gap-2 mb-4">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/60">
          <Calculator className="h-4 w-4 text-rust" aria-hidden="true" />
        </div>
        <span className="text-[15px] font-medium tracking-[-0.009em] text-ink">
          {cLocale.leads.systemEstimate.title}
        </span>
        <span className="ml-auto text-[12px] text-graphite">{createdAt}</span>
      </div>

      {/* 广告法自查 P1-03：无评估资质，明确标注非专业评估报告 */}
      <p className="mb-3 text-[11px] leading-relaxed text-graphite">
        {cLocale.leads.systemEstimate.disclaimer}
      </p>

      {evalPrice !== null ? (
        <>
          <div className="rounded-inputs bg-white/60 p-5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[14px] text-ash">
                {cLocale.leads.systemEstimate.priceLabel}
              </span>
              {hasDays && (
                <span className="text-[12px] text-rust">
                  装修后预计 {expectedSaleDays} 天可出手
                </span>
              )}
            </div>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-[44px] font-medium leading-[1.1] tracking-[-0.66px] text-ink tabular-nums">
                {evalPrice}
              </span>
              <span className="text-[15px] font-medium text-rust">
                {cLocale.leads.systemEstimate.unit}
              </span>
            </div>

            {/* 结论句：把评分与周期翻译成一句人话（serif，与数字形成「句子 / 数字」对照） */}
            {hasMetrics && (
              <p className="mt-4 border-t border-[#e9cbb6] pt-4 font-serif text-[16px] leading-[1.55] text-rust">
                {hasScore
                  ? `房源条件${scoreLabel(conditionScore)}${hasDays ? `，装修后预计 ${expectedSaleDays} 天可出手。` : "。"}`
                  : `装修后预计 ${expectedSaleDays} 天可出手。`}
              </p>
            )}

            {/* 双指标 */}
            {hasMetrics && (
              <div className="mt-4 flex">
                <div className="flex-1">
                  <div className="text-[11px] text-[#8a6250]">
                    {cLocale.leads.systemEstimate.scoreLabel}
                  </div>
                  <div className="mt-1 flex items-baseline gap-1">
                    {hasScore ? (
                      <>
                        <span className="text-[26px] font-medium leading-none text-rust tabular-nums">
                          {conditionScore}
                        </span>
                        <span className="text-[11px] text-[#8a6250]">/ 5</span>
                      </>
                    ) : (
                      <span className="text-[13px] text-graphite">
                        {cLocale.leads.systemEstimate.scorePending}
                      </span>
                    )}
                  </div>
                  <div className="mt-1.5 flex items-center gap-[2px]" aria-hidden="true">
                    {filled.map((on, i) => (
                      <Star
                        key={i}
                        className={`h-3 w-3 ${on ? "fill-rust text-rust" : "fill-transparent text-[#f2d0ba]"}`}
                      />
                    ))}
                  </div>
                  {hasScore && (
                    <div className="mt-1 text-[11.5px] text-[#8a6250]">
                      {scoreLabel(conditionScore)}
                    </div>
                  )}
                </div>

                <div className="flex-1 border-l border-[#e9cbb6] pl-6">
                  <div className="text-[11px] text-[#8a6250]">
                    {cLocale.leads.systemEstimate.cycleLabel}
                  </div>
                  <div className="mt-1 flex items-baseline gap-1">
                    {hasDays ? (
                      <>
                        <span className="text-[26px] font-medium leading-none text-rust tabular-nums">
                          {expectedSaleDays}
                        </span>
                        <span className="text-[11px] text-[#8a6250]">天</span>
                      </>
                    ) : (
                      <span className="text-[13px] text-graphite">
                        {cLocale.leads.systemEstimate.cyclePending}
                      </span>
                    )}
                  </div>
                  <div className="mt-1.5 text-[11.5px] text-[#8a6250]">
                    {/* 永远给翻译：不给裸天数 */}
                    {hasDays ? daysSay(expectedSaleDays) : ""}
                  </div>
                </div>
              </div>
            )}

            {/* 存量线索说明：显式告知而非静默留白 */}
            {!hasMetrics && (
              <p className="mt-4 rounded-inputs bg-white/50 px-3 py-2 text-[11.5px] leading-relaxed text-graphite">
                {cLocale.leads.systemEstimate.legacyNotice}
              </p>
            )}
          </div>

          {/* 评估人：让「对数字有疑问」有出口 */}
          {evaluator && (
            <div className="mt-3 flex items-center gap-3 rounded-inputs bg-white px-4 py-3.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#d3e3fc] text-[13px] font-medium text-[#2a5ca0]">
                {evaluator.nickname?.slice(0, 1) ?? "评"}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-[13px] font-medium text-ink">
                  {evaluator.nickname ?? "—"}
                  <span className="text-[10px] font-normal text-graphite">
                    {cLocale.leads.systemEstimate.evaluatorHint}
                  </span>
                </div>
                <div className="mt-0.5 font-mono text-[12px] tracking-[0.04em] text-ash">
                  {evaluator.phone_masked ?? cLocale.leads.systemEstimate.evaluatorNoPhone}
                </div>
              </div>
              {evaluator.phone_masked && onContactEvaluator && (
                <button
                  type="button"
                  onClick={handleContact}
                  disabled={contacting}
                  className="shrink-0 rounded-full border border-ink bg-ink px-4 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-ink/90 disabled:opacity-60"
                >
                  {contacting ? "…" : cLocale.leads.systemEstimate.contactByPhone}
                </button>
              )}
            </div>
          )}
        </>
      ) : (
        <div className="rounded-inputs bg-white/60 p-5">
          <p className="text-[15px] text-ash">{cLocale.leads.systemEstimate.pending}</p>
        </div>
      )}
    </div>
  );
}

/** 拨号失败统一提示（文案单一来源；父级与组件共用） */
export function notifyContactFailure(): void {
  toast.error(cLocale.leads.systemEstimate.contactFailed);
}
