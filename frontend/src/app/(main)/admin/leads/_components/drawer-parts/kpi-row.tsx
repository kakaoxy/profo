import React from "react";
import { Wallet, Target, Ruler, TrendingUp, Star, CalendarClock } from "lucide-react";
import { cn } from "@/lib/utils";
import { Lead } from "../../types";
import { Stars } from "./verdict-badges";
import { SCORE_LABELS, daysSummary, daysTier, daysTierLabel } from "@/lib/lead-verdict";

interface KpiRowProps {
  lead: Lead;
}

interface KpiCardProps {
  icon: React.ElementType;
  label: string;
  value: React.ReactNode;
  valueClassName?: string;
  meta: React.ReactNode;
  metaClassName?: string;
  className?: string;
  /** 右上角「新增」标记（本迭代新增的两格用） */
  isNew?: boolean;
}

const KpiCard: React.FC<KpiCardProps> = ({
  icon: Icon,
  label,
  value,
  valueClassName,
  meta,
  metaClassName,
  className,
  isNew,
}) => (
  <div
    className={cn(
      "relative bg-white rounded-cards shadow-steep-sm p-3 flex flex-col gap-1",
      className,
    )}
  >
    {isNew && (
      <span className="absolute right-2.5 top-2 rounded-full bg-apricot-wash px-1.5 py-px font-mono text-[8px] tracking-[0.1em] text-rust">
        新增
      </span>
    )}
    <span className="text-[11px] font-medium text-graphite flex items-center gap-1.5">
      <Icon className="h-3 w-3" />
      {label}
    </span>
    <span className={cn("text-xl font-medium tabular-nums text-ink leading-tight", valueClassName)}>
      {value}
    </span>
    <span className={cn("text-[11px] font-medium text-graphite", metaClassName)}>{meta}</span>
  </div>
);

export const KpiRow: React.FC<KpiRowProps> = ({ lead }) => {
  const hasEval = lead.evalPrice != null;
  const hasScore =
    lead.conditionScore != null && lead.conditionScore >= 1 && lead.conditionScore <= 5;
  const hasDays = lead.expectedSaleDays != null && lead.expectedSaleDays > 0;
  const deltaValue = hasEval ? lead.evalPrice! - lead.totalPrice : null;
  const deltaPctNum =
    hasEval && lead.totalPrice > 0 ? (lead.evalPrice! / lead.totalPrice - 1) * 100 : null;
  const deltaPctStr = deltaPctNum != null ? deltaPctNum.toFixed(1) : null;

  // 评估价卡片 meta：差值与百分比（正数 + 号，正数 success / 负数 error）
  const evalMeta =
    hasEval && deltaValue != null && deltaPctStr != null ? (
      <span
        className={cn(
          deltaValue > 0 ? "text-success" : deltaValue < 0 ? "text-error" : "text-graphite",
        )}
      >
        {deltaValue > 0 ? "+" : ""}
        {deltaValue} 万 · {deltaPctNum! > 0 ? "+" : ""}
        {deltaPctStr}%
      </span>
    ) : (
      "尚未录入评估价"
    );

  // 报价偏离卡片 meta 描述
  const deviationMeta = !hasEval
    ? "待评估计算"
    : deltaValue! < 0
      ? `低于报价 ${Math.abs(deltaValue!)} 万`
      : "评估价 ≥ 报价";

  const deviationValueClassName = !hasEval
    ? "text-graphite"
    : deltaValue! > 0
      ? "text-success"
      : deltaValue! < 0
        ? "text-error"
        : "text-graphite";

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
      {/* 卡片1：业主报价 */}
      <KpiCard
        icon={Wallet}
        label="业主报价"
        value={
          <>
            ¥{lead.totalPrice}
            <span className="text-xs font-medium text-graphite ml-1">万</span>
          </>
        }
        meta={`¥${lead.unitPrice.toFixed(2)} 万/㎡`}
      />

      {/* 卡片2：评估价 */}
      <KpiCard
        icon={Target}
        label="评估价"
        value={
          hasEval ? (
            <>
              ¥{lead.evalPrice}
              <span className="text-xs font-medium text-graphite ml-1">万</span>
            </>
          ) : (
            "待评估"
          )
        }
        meta={evalMeta}
      />

      {/* 卡片3：面积 / 单价 */}
      <KpiCard
        icon={Ruler}
        label="面积 / 单价"
        value={
          <>
            {lead.area}
            <span className="text-xs font-medium text-graphite ml-1">㎡</span>
          </>
        }
        meta={`¥${lead.unitPrice.toFixed(2)} 万/㎡`}
      />

      {/* 卡片4：报价偏离（正负语义保留在文字功能色） */}
      <KpiCard
        icon={TrendingUp}
        label="报价偏离"
        valueClassName={deviationValueClassName}
        value={hasEval && deltaPctStr != null ? `${deltaPctStr}%` : "--"}
        meta={deviationMeta}
      />

      {/* 卡片5：房源条件分（本迭代新增；无评估时显示「未评分」，不补默认值） */}
      <KpiCard
        icon={Star}
        label="房源条件分"
        isNew
        value={
          hasScore ? (
            <>
              {lead.conditionScore}
              <span className="text-xs font-medium text-graphite ml-1">/ 5</span>
            </>
          ) : (
            <span className="text-[15px] text-graphite">未评分</span>
          )
        }
        valueClassName={hasScore ? undefined : "text-graphite"}
        meta={
          hasScore ? (
            <span className="inline-flex flex-col gap-1">
              <Stars score={lead.conditionScore} size="md" />
              <span>{SCORE_LABELS[lead.conditionScore as 1 | 2 | 3 | 4 | 5]}</span>
            </span>
          ) : (
            "完成评估后可打分"
          )
        }
      />

      {/* 卡片6：装修后可售周期（本迭代新增） */}
      <KpiCard
        icon={CalendarClock}
        label="可售周期"
        isNew
        value={
          hasDays ? (
            <>
              {lead.expectedSaleDays}
              <span className="text-xs font-medium text-graphite ml-1">天</span>
            </>
          ) : (
            <span className="text-[15px] text-graphite">周期待补</span>
          )
        }
        valueClassName={hasDays ? undefined : "text-graphite"}
        meta={
          hasDays
            ? `${daysTierLabel(lead.expectedSaleDays)} · ${daysSummary(lead.expectedSaleDays).split("· ")[1]}`
            : "完成评估后可预估"
        }
        metaClassName={daysTier(lead.expectedSaleDays) === "rush" ? "text-rust" : undefined}
      />
    </div>
  );
};
