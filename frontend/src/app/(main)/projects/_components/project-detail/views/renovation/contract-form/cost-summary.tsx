"use client";

import { Calculator } from "lucide-react";
import { RenovationContractFormValues } from "./schema";

interface CostSummaryProps {
  values: RenovationContractFormValues;
}

// 格式化金额显示（保留两位小数）
function formatAmount(amount: number | undefined | null): string {
  if (amount === undefined || amount === null || isNaN(amount)) return "-";
  return `¥${amount.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// 费用汇总
export function CostSummarySection({ values }: CostSummaryProps) {
  // 计算装修总预算
  const totalBudget =
    (values.hard_contract_amount || 0) +
    (values.soft_budget || 0) +
    (values.design_fee || 0) +
    (values.demolition_fee || 0) +
    (values.garbage_fee || 0) +
    (values.other_extra_fee || 0);

  // 计算装修实际发生费用
  const totalActualCost =
    (values.hard_contract_amount || 0) +
    (values.soft_actual_cost || 0) +
    (values.design_fee || 0) +
    (values.demolition_fee || 0) +
    (values.garbage_fee || 0) +
    (values.other_extra_fee || 0);

  // 费用明细数据
  const items = [
    { label: "硬装", value: values.hard_contract_amount },
    { label: "软装预算", value: values.soft_budget },
    { label: "软装实际", value: values.soft_actual_cost },
    { label: "设计费", value: values.design_fee },
    { label: "拆旧费", value: values.demolition_fee },
    { label: "清运费", value: values.garbage_fee },
    { label: "其他", value: values.other_extra_fee },
  ];

  return (
    <div className="space-y-3 pt-3 border-t border-slate-200">
      <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1">
        <Calculator className="h-3 w-3" />
        费用汇总
      </h4>

      {/* 汇总卡片 - 紧凑布局 */}
      <div className="grid grid-cols-2 gap-3">
        <div className="p-3 bg-blue-50 rounded border border-blue-100">
          <div className="text-[10px] text-slate-500 mb-0.5">总预算</div>
          <div className="text-base font-bold text-blue-700">{formatAmount(totalBudget)}</div>
        </div>
        <div className="p-3 bg-green-50 rounded border border-green-100">
          <div className="text-[10px] text-slate-500 mb-0.5">实际费用</div>
          <div className="text-base font-bold text-green-700">{formatAmount(totalActualCost)}</div>
        </div>
      </div>

      {/* 费用明细 - 网格布局 */}
      <div className="grid grid-cols-4 gap-x-2 gap-y-1 text-[10px]">
        {items.map((item) => (
          <div key={item.label} className="flex justify-between py-1 border-b border-slate-100">
            <span className="text-slate-400">{item.label}</span>
            <span className="font-medium text-slate-600">{formatAmount(item.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
