import React from "react";
import { Wallet, Target, Ruler, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { Lead } from "../../types";

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
}

const KpiCard: React.FC<KpiCardProps> = ({
  icon: Icon,
  label,
  value,
  valueClassName,
  meta,
  metaClassName,
  className,
}) => (
  <div
    className={cn("bg-pure-white rounded-cards shadow-steep-sm p-4 flex flex-col gap-1", className)}
  >
    <span className="text-xs font-medium text-graphite flex items-center gap-1.5">
      <Icon className="h-3 w-3" />
      {label}
    </span>
    <span
      className={cn("text-2xl font-medium tabular-nums text-ink leading-tight", valueClassName)}
    >
      {value}
    </span>
    <span className={cn("text-xs font-medium text-graphite", metaClassName)}>{meta}</span>
  </div>
);

export const KpiRow: React.FC<KpiRowProps> = ({ lead }) => {
  const hasEval = lead.evalPrice != null;
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
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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
    </div>
  );
};
