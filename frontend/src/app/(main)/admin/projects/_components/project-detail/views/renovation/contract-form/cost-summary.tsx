"use client";

import { Calculator } from "lucide-react";
import { RenovationContractFormValues } from "./schema";

interface CostSummaryProps {
  values: RenovationContractFormValues;
  area?: number;
}

// 格式化金额显示（保留两位小数）
function formatAmount(amount: number | undefined | null): string {
  if (amount === undefined || amount === null || isNaN(amount)) return "-";
  return `¥${amount.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// 格式化单价显示（保留两位小数，单位 元/m²）
function formatUnitPrice(amount: number | undefined | null, area: number | undefined): string {
  if (amount === undefined || amount === null || isNaN(amount)) return "-";
  if (!area || area <= 0) return "-";
  const unitPrice = amount / area;
  return `${unitPrice.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} 元/m²`;
}

// 费用汇总
export function CostSummarySection({ values, area }: CostSummaryProps) {
  const areaNum = Number(area) || 0;

  // 各分项金额（Number() 兜底，防止 Decimal 字符串）
  const hardAmount = Number(values.hard_contract_amount) || 0;
  const softAmount = Number(values.soft_budget) || 0;
  const cabinetAmount = Number(values.custom_cabinet_amount) || 0;
  const windowAmount = Number(values.window_amount) || 0;
  const applianceAmount = Number(values.appliance_amount) || 0;
  const designFee = Number(values.design_fee) || 0;
  const demolitionFee = Number(values.demolition_fee) || 0;
  const garbageFee = Number(values.garbage_fee) || 0;
  const otherExtraFee = Number(values.other_extra_fee) || 0;

  // 其他费用 = 设计费 + 拆旧费 + 清运费 + 其他
  const otherFees = designFee + demolitionFee + garbageFee + otherExtraFee;

  // 总金额 = 硬装 + 软装 + 定制柜 + 窗户 + 电器 + 其他
  const totalAmount = hardAmount + softAmount + cabinetAmount + windowAmount + applianceAmount + otherFees;

  // 明细项（顺序按需求：硬装金额、硬装单价、软装金额、定制柜、窗户、电器、其他费用、总单价）
  const items = [
    { label: "硬装金额", value: formatAmount(hardAmount) },
    { label: "硬装单价", value: formatUnitPrice(hardAmount, areaNum) },
    { label: "软装金额", value: formatAmount(softAmount) },
    { label: "定制柜", value: formatAmount(cabinetAmount) },
    { label: "窗户", value: formatAmount(windowAmount) },
    { label: "电器", value: formatAmount(applianceAmount) },
    { label: "其他费用", value: formatAmount(otherFees) },
    { label: "总单价", value: formatUnitPrice(totalAmount, areaNum) },
  ];

  return (
    <div className="space-y-3 pt-3 border-t border-border">
      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
        <Calculator className="h-3 w-3" />
        费用汇总
        {areaNum > 0 && (
          <span className="ml-1 text-[10px] font-normal text-muted-foreground/70">
            (面积: {areaNum.toFixed(2)} m²)
          </span>
        )}
      </h4>

      {/* 汇总卡片 - 紧凑布局 */}
      <div className="grid grid-cols-2 gap-3">
        <div className="p-3 bg-primary/5 rounded border border-primary/20">
          <div className="text-[10px] text-muted-foreground mb-0.5">总金额</div>
          <div className="text-base font-bold text-primary">{formatAmount(totalAmount)}</div>
        </div>
        <div className="p-3 bg-success/10 rounded border border-green-100">
          <div className="text-[10px] text-muted-foreground mb-0.5">总单价</div>
          <div className="text-base font-bold text-green-700">{formatUnitPrice(totalAmount, areaNum)}</div>
        </div>
      </div>

      {/* 费用明细 - 网格布局 */}
      <div className="grid grid-cols-4 gap-x-2 gap-y-1 text-[10px]">
        {items.map((item) => (
          <div key={item.label} className="flex flex-col py-1 border-b border-border">
            <span className="text-muted-foreground">{item.label}</span>
            <span className="font-medium text-foreground">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
