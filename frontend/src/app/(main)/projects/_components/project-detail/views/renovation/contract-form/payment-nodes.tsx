"use client";

import { CreditCard, Calculator, AlertTriangle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { RenovationContractFormValues } from "./schema";
import { UseFormSetValue } from "react-hook-form";

interface PaymentNodesProps {
  values: RenovationContractFormValues;
  setValue: UseFormSetValue<RenovationContractFormValues>;
  isEditing: boolean;
}

// 格式化金额显示
function formatAmount(amount: number | undefined | null): string {
  if (amount === undefined || amount === null || isNaN(amount)) return "-";
  return `¥${amount.toLocaleString("zh-CN", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

// 支付节点行组件
function PaymentNodeRow({
  index,
  nodeValue,
  ratioValue,
  hardAmount,
  isEditing,
  onNodeChange,
  onRatioChange,
}: {
  index: number;
  nodeValue: string;
  ratioValue: number | undefined;
  hardAmount: number;
  isEditing: boolean;
  onNodeChange: (v: string) => void;
  onRatioChange: (v: number | undefined) => void;
}) {
  const calculatedAmount = ratioValue && hardAmount ? hardAmount * (ratioValue / 100) : undefined;

  return (
    <div className="grid grid-cols-3 gap-3 items-center py-2 px-2 bg-slate-50 rounded border-b border-slate-100 last:border-b-0">
      {/* 支付节点 */}
      <div>
        <Input
          type="text"
          placeholder="如：合同签订后"
          value={nodeValue || ""}
          onChange={(e) => onNodeChange(e.target.value)}
          disabled={!isEditing}
          className="h-7 text-xs px-2"
        />
      </div>

      {/* 支付比例 */}
      <div>
        <div className="relative">
          <Input
            type="number"
            placeholder="比例"
            value={ratioValue ?? ""}
            onChange={(e) => {
              const val = e.target.value;
              onRatioChange(val === "" ? undefined : parseFloat(val));
            }}
            disabled={!isEditing}
            className="h-7 text-xs px-2 pr-6"
          />
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-400">%</span>
        </div>
      </div>

      {/* 计算金额 */}
      <div className="text-right">
        <span className={`text-xs font-semibold ${calculatedAmount ? "text-blue-600" : "text-slate-400"}`}>
          {formatAmount(calculatedAmount)}
        </span>
      </div>
    </div>
  );
}

// 支付节点
export function PaymentNodesSection({ values, setValue, isEditing }: PaymentNodesProps) {
  const hardAmount = values.hard_contract_amount || 0;

  // 计算总支付比例
  const totalRatio =
    (values.payment_ratio_1 || 0) +
    (values.payment_ratio_2 || 0) +
    (values.payment_ratio_3 || 0) +
    (values.payment_ratio_4 || 0);

  // 是否超过100%
  const isOverLimit = totalRatio > 100;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1">
          <CreditCard className="h-3 w-3" />
          支付节点
        </h4>
        {/* 支付比例汇总显示 */}
        <div className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
          isOverLimit
            ? "bg-red-100 text-red-700"
            : totalRatio === 100
            ? "bg-green-100 text-green-700"
            : "bg-slate-100 text-slate-600"
        }`}>
          合计: {totalRatio.toFixed(0)}%
          {isOverLimit && <span className="ml-1">⚠️</span>}
        </div>
      </div>

      {/* 预警提示 */}
      {isOverLimit && (
        <div className="flex items-center gap-1.5 p-2 bg-red-50 border border-red-200 rounded text-red-700 text-xs">
          <AlertTriangle className="h-3 w-3 flex-shrink-0" />
          <span className="text-[11px]">支付比例之和({totalRatio.toFixed(0)}%)已超过100%</span>
        </div>
      )}

      {/* 表头 */}
      <div className="grid grid-cols-3 gap-3 px-2 py-1 bg-slate-100 rounded text-[10px] font-medium text-slate-500">
        <div>支付节点</div>
        <div>比例</div>
        <div className="text-right">金额</div>
      </div>

      {/* 支付节点列表 */}
      <div className="space-y-1">
        {[1, 2, 3, 4].map((index) => (
          <PaymentNodeRow
            key={index}
            index={index}
            nodeValue={values[`payment_node_${index}` as keyof RenovationContractFormValues] as string}
            ratioValue={values[`payment_ratio_${index}` as keyof RenovationContractFormValues] as number}
            hardAmount={hardAmount}
            isEditing={isEditing}
            onNodeChange={(v) => setValue(`payment_node_${index}` as keyof RenovationContractFormValues, v)}
            onRatioChange={(v) => setValue(`payment_ratio_${index}` as keyof RenovationContractFormValues, v)}
          />
        ))}
      </div>
    </div>
  );
}
