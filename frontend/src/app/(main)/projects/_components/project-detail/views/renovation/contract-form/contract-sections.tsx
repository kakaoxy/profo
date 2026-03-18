"use client";

import {
  Building2,
  Calendar,
  HardHat,
  CreditCard,
  Sofa,
  Receipt,
} from "lucide-react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DatePickerField, NumberInputField, TextInputField } from "./form-fields";
import { RenovationContractFormValues } from "./schema";
import { UseFormWatch, UseFormSetValue } from "react-hook-form";

interface ContractSectionsProps {
  values: RenovationContractFormValues;
  setValue: UseFormSetValue<RenovationContractFormValues>;
  isEditing: boolean;
}

// 装修公司信息
export function CompanySection({ values, setValue, isEditing }: ContractSectionsProps) {
  return (
    <div className="space-y-3">
      <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
        <Building2 className="h-3.5 w-3.5" />
        装修公司
      </h4>
      <div className="grid grid-cols-1 gap-4">
        <TextInputField
          label="合作装修公司"
          value={values.renovation_company}
          onChange={(v) => setValue("renovation_company", v)}
          placeholder="请输入装修公司名称"
          disabled={!isEditing}
        />
      </div>
    </div>
  );
}

// 合同时间
export function ContractTimeSection({ values, setValue, isEditing }: ContractSectionsProps) {
  return (
    <div className="space-y-3">
      <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
        <Calendar className="h-3.5 w-3.5" />
        合同时间
      </h4>
      <div className="grid grid-cols-2 gap-4">
        <DatePickerField
          label="合同约定进场时间"
          value={values.contract_start_date}
          onChange={(d) => setValue("contract_start_date", d)}
          disabled={!isEditing}
        />
        <DatePickerField
          label="合同约定竣工交房时间"
          value={values.contract_end_date}
          onChange={(d) => setValue("contract_end_date", d)}
          disabled={!isEditing}
        />
      </div>
    </div>
  );
}

// 实际时间
export function ActualTimeSection({ values, setValue, isEditing }: ContractSectionsProps) {
  return (
    <div className="space-y-3">
      <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
        <Calendar className="h-3.5 w-3.5" />
        实际时间
      </h4>
      <div className="grid grid-cols-2 gap-4">
        <DatePickerField
          label="实际开工时间"
          value={values.actual_start_date}
          onChange={(d) => setValue("actual_start_date", d)}
          disabled={!isEditing}
        />
        <DatePickerField
          label="实际竣工时间"
          value={values.actual_end_date}
          onChange={(d) => setValue("actual_end_date", d)}
          disabled={!isEditing}
        />
      </div>
    </div>
  );
}

// 硬装费用
export function HardDecorationSection({ values, setValue, isEditing }: ContractSectionsProps) {
  return (
    <div className="space-y-3">
      <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
        <HardHat className="h-3.5 w-3.5" />
        硬装费用
      </h4>
      <div className="grid grid-cols-1 gap-4">
        <NumberInputField
          label="硬装合同总金额"
          value={values.hard_contract_amount}
          onChange={(v) => setValue("hard_contract_amount", v)}
          placeholder="请输入硬装合同金额"
          disabled={!isEditing}
          suffix="元"
        />
      </div>
    </div>
  );
}

// 支付节点
export function PaymentNodesSection({ values, setValue, isEditing }: ContractSectionsProps) {
  return (
    <div className="space-y-3">
      <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
        <CreditCard className="h-3.5 w-3.5" />
        支付节点
      </h4>
      <div className="space-y-3">
        {[1, 2, 3, 4].map((index) => (
          <div key={index} className="grid grid-cols-2 gap-4 p-3 bg-slate-50 rounded-lg">
            <TextInputField
              label={`第${index}笔款项支付节点`}
              value={values[`payment_node_${index}` as keyof RenovationContractFormValues] as string}
              onChange={(v) =>
                setValue(`payment_node_${index}` as keyof RenovationContractFormValues, v)
              }
              placeholder={`如：合同签订后、水电完工后等`}
              disabled={!isEditing}
            />
            <NumberInputField
              label={`第${index}笔款项支付比例`}
              value={values[`payment_ratio_${index}` as keyof RenovationContractFormValues] as number}
              onChange={(v) =>
                setValue(`payment_ratio_${index}` as keyof RenovationContractFormValues, v)
              }
              placeholder="0-100"
              disabled={!isEditing}
              suffix="%"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

// 软装费用
export function SoftDecorationSection({ values, setValue, isEditing }: ContractSectionsProps) {
  return (
    <div className="space-y-3">
      <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
        <Sofa className="h-3.5 w-3.5" />
        软装费用
      </h4>
      <div className="grid grid-cols-2 gap-4">
        <NumberInputField
          label="软装预算金额"
          value={values.soft_budget}
          onChange={(v) => setValue("soft_budget", v)}
          placeholder="请输入软装预算"
          disabled={!isEditing}
          suffix="元"
        />
        <NumberInputField
          label="软装实际发生成本"
          value={values.soft_actual_cost}
          onChange={(v) => setValue("soft_actual_cost", v)}
          placeholder="请输入实际成本"
          disabled={!isEditing}
          suffix="元"
        />
      </div>
    </div>
  );
}

// 其他费用
export function OtherFeesSection({ values, setValue, isEditing }: ContractSectionsProps) {
  return (
    <div className="space-y-3">
      <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
        <Receipt className="h-3.5 w-3.5" />
        其他费用
      </h4>
      <div className="grid grid-cols-2 gap-4">
        <NumberInputField
          label="设计费用"
          value={values.design_fee}
          onChange={(v) => setValue("design_fee", v)}
          placeholder="请输入设计费"
          disabled={!isEditing}
          suffix="元"
        />
        <NumberInputField
          label="拆旧费用"
          value={values.demolition_fee}
          onChange={(v) => setValue("demolition_fee", v)}
          placeholder="请输入拆旧费"
          disabled={!isEditing}
          suffix="元"
        />
        <NumberInputField
          label="垃圾清运费用"
          value={values.garbage_fee}
          onChange={(v) => setValue("garbage_fee", v)}
          placeholder="请输入垃圾清运费"
          disabled={!isEditing}
          suffix="元"
        />
        <NumberInputField
          label="其他额外费用"
          value={values.other_extra_fee}
          onChange={(v) => setValue("other_extra_fee", v)}
          placeholder="请输入其他费用"
          disabled={!isEditing}
          suffix="元"
        />
      </div>
      <div className="space-y-2">
        <Label className="text-xs font-medium text-slate-600">其他费用原因</Label>
        <Textarea
          placeholder="请说明其他费用的产生原因..."
          value={values.other_fee_reason || ""}
          onChange={(e) => setValue("other_fee_reason", e.target.value)}
          disabled={!isEditing}
          className="min-h-[80px] text-sm resize-none"
        />
      </div>
    </div>
  );
}
