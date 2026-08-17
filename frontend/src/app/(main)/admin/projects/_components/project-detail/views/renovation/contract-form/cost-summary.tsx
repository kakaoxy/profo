"use client";

import { RenovationContractFormValues } from "./schema";

interface CostSummaryProps {
  values: RenovationContractFormValues;
  area?: number;
}

/**
 * 金额展示（设计稿 .info-item .v「21.5 万元」）：绝对值（元）→ 万元，
 * 整数不带小数、非整数保留 1 位小数（0.9 万 / 21.5 万 / 36.7 万）
 */
export function formatWanAmount(amount: number | undefined | null): string {
  if (amount === undefined || amount === null || isNaN(amount)) return "-";
  const wan = amount / 10000;
  const text = Number.isInteger(wan)
    ? wan.toLocaleString("zh-CN", { maximumFractionDigits: 0 })
    : wan.toLocaleString("zh-CN", { maximumFractionDigits: 1 });
  return `${text} 万元`;
}

/** 单价展示（设计稿「4,124 元 / ㎡」）：总额 ÷ 面积，四舍五入取整 + 千分位 */
export function formatUnitPrice(
  amount: number | undefined | null,
  area: number | undefined,
): string {
  if (amount === undefined || amount === null || isNaN(amount)) return "-";
  if (!area || area <= 0) return "-";
  const unitPrice = amount / area;
  return `${Math.round(unitPrice).toLocaleString("zh-CN")} 元 / ㎡`;
}

// 费用汇总（设计稿 1315-1319：group-title「费用汇总（自动计算 · 只读）」+ 总金额/总单价两行）
export function CostSummarySection({ values, area }: CostSummaryProps) {
  const areaNum = Number(area) || 0;

  // 各分项金额（Number() 兜底，防止 Decimal 字符串）
  const hardAmount = Number(values.hard_contract_amount) || 0;
  const softAmount = Number(values.soft_budget) || 0;
  const cabinetAmount = Number(values.custom_cabinet_amount) || 0;
  const windowAmount = Number(values.window_amount) || 0;
  const wallTreatmentAmount = Number(values.wall_treatment_amount) || 0;
  const designFee = Number(values.design_fee) || 0;
  const demolitionFee = Number(values.demolition_fee) || 0;
  const garbageFee = Number(values.garbage_fee) || 0;
  const otherExtraFee = Number(values.other_extra_fee) || 0;

  // 其他装修 = 设计费 + 拆旧费 + 清运费 + 其他
  const otherDecoration = designFee + demolitionFee + garbageFee + otherExtraFee;

  // 总金额 = 硬装 + 软装 + 定制柜 + 窗户 + 墙面 + 其他装修
  const totalAmount =
    hardAmount + softAmount + cabinetAmount + windowAmount + wallTreatmentAmount + otherDecoration;

  return (
    <div>
      <div className="flex items-center gap-2 text-[13px] font-[500] uppercase tracking-[0.05em] text-graphite after:h-px after:flex-1 after:bg-[#f0f0f2]">
        费用汇总（自动计算 · 只读）
      </div>
      <div className="mt-1 grid grid-cols-2 gap-x-8">
        <div className="flex flex-col gap-[3px] border-b border-[#f0f0f2] py-[13px]">
          <span className="text-[13px] font-[430] text-graphite">总金额</span>
          <span className="text-[14.5px] font-[480] text-ink">{formatWanAmount(totalAmount)}</span>
        </div>
        <div className="flex flex-col gap-[3px] border-b border-[#f0f0f2] py-[13px]">
          <span className="text-[13px] font-[430] text-graphite">总单价</span>
          <span className="text-[14.5px] font-[450] text-ink">
            {formatUnitPrice(totalAmount, areaNum)}
          </span>
        </div>
      </div>
    </div>
  );
}
