import React from "react";
import { Lead } from "../../types";
import { cn } from "@/lib/utils";

interface KpiRowProps {
  lead: Lead;
}

/** 详情首屏价格带：只保留三个决策数字，评分与周期由评估结论卡承接。 */
export const KpiRow: React.FC<KpiRowProps> = ({ lead }) => {
  const hasEval = lead.evalPrice != null;
  const hasPrice = lead.totalPrice > 0;
  const unitPrice = lead.unitPrice || (hasPrice && lead.area > 0 ? lead.totalPrice / lead.area : 0);
  const evalUnitPrice = hasEval && lead.area > 0 ? lead.evalPrice! / lead.area : null;
  const deltaPct =
    hasEval && lead.totalPrice > 0 ? (lead.evalPrice! / lead.totalPrice - 1) * 100 : null;
  const deltaText = deltaPct == null ? "待评估" : `${deltaPct > 0 ? "+" : ""}${deltaPct.toFixed(1)}%`;

  return (
    <div className="mt-4 grid grid-cols-3 overflow-hidden rounded-[16px] bg-apricot-wash">
      <PriceCell
        label="业主报价"
        value={hasPrice ? lead.totalPrice.toLocaleString("zh-CN") : "—"}
        unit={hasPrice ? "万" : ""}
        meta={`单价 ${unitPrice > 0 ? unitPrice.toFixed(2) : "—"} 万/㎡`}
      />
      <PriceCell
        label="授权评估价"
        value={hasEval ? lead.evalPrice!.toLocaleString("zh-CN") : "待评估"}
        unit={hasEval ? "万" : ""}
        meta={evalUnitPrice ? `单价 ${evalUnitPrice.toFixed(2)} 万/㎡` : "等待给出评估结论"}
        muted={!hasEval}
      />
      <PriceCell
        label="报价偏离"
        value={deltaText}
        unit=""
        meta={
          deltaPct == null
            ? "完成评估后计算"
            : deltaPct < 0
              ? "评估低于报价"
              : "评估不低于报价"
        }
      />
    </div>
  );
};

const PriceCell = ({
  label,
  value,
  unit,
  meta,
  muted,
}: {
  label: string;
  value: string;
  unit: string;
  meta: string;
  muted?: boolean;
}) => (
  <div className="min-w-0 border-l border-rust/10 px-[18px] py-4 first:border-l-0">
    <div className="text-[10px] text-rust/70">{label}</div>
    <div
      className={cn(
        "mt-1 text-[23px] font-[480] leading-[1.1] tracking-[-0.02em] text-rust tabular-nums",
        muted && "text-[14px] text-rust/70",
      )}
    >
      {value}
      {unit ? <small className="ml-0.5 text-[10px] font-normal opacity-70">{unit}</small> : null}
    </div>
    <div className="mt-1 text-[9.5px] text-rust/60">{meta}</div>
  </div>
);
