"use client";

import { useEffect, useState } from "react";
import { UseFormReturn, useWatch } from "react-hook-form";
import { FormValues } from "../schema";
import { SimpleInputField, SimpleTextareaField } from "../form-components";
import { DatePickerField } from "../date-picker-field";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
} from "@/components/ui/form";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Input } from "@/components/ui/input";

const COST_ASSUMPTION_OPTIONS = [
  { value: "meifangbao", label: "美房宝承担" },
  { value: "owner", label: "业主承担" },
  { value: "respective", label: "各自承担" },
  { value: "other", label: "其他" },
] as const;

// 生成合同编号: MFB-年月+自增序号
function generateContractNo(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const prefix = `MFB-${year}${month}`;
  
  // 从 localStorage 获取当前月份的序号
  const storageKey = `contract_no_counter_${year}${month}`;
  let counter = parseInt(localStorage.getItem(storageKey) || "0", 10);
  counter += 1;
  localStorage.setItem(storageKey, String(counter));
  
  // 格式化为4位数字
  const serial = String(counter).padStart(4, "0");
  return `${prefix}${serial}`;
}

export function AgencyAgreementTab({ form }: { form: UseFormReturn<FormValues> }) {
  const { control, setValue } = form;
  const [isContractNoSet, setIsContractNoSet] = useState(false);
  
  // 监听税费承担方类型
  const costAssumptionType = useWatch({
    control,
    name: "cost_assumption_type",
  });

  // 自动生成合同编号（仅新建时）
  useEffect(() => {
    if (!isContractNoSet) {
      const contractNo = generateContractNo();
      setValue("contract_no", contractNo);
      setIsContractNoSet(true);
    }
  }, [isContractNoSet, setValue]);

  return (
    <div className="space-y-5">
      {/* 合同编号 */}
      <SimpleInputField
        control={control}
        name="contract_no"
        label="合同编号"
        placeholder="请输入合同编号"
        required
      />

      {/* 签约日期 & 业主交房时间 */}
      <div className="grid grid-cols-2 gap-4">
        <DatePickerField
          control={control}
          name="signing_date"
          label="签约日期"
        />
        <DatePickerField
          control={control}
          name="planned_handover_date"
          label="业主交房时间"
        />
      </div>

      {/* 签约价格 & 合同周期 */}
      <div className="grid grid-cols-2 gap-4">
        <SimpleInputField
          control={control}
          name="signing_price"
          label="签约价格 (万)"
          type="number"
          step="0.01"
        />
        <SimpleInputField
          control={control}
          name="signing_period"
          label="合同周期 (天)"
          type="number"
        />
      </div>

      {/* 顺延期 & 顺延期租金 */}
      <div className="grid grid-cols-2 gap-4">
        <SimpleInputField
          control={control}
          name="extension_period"
          label="顺延期 (天)"
          type="number"
        />
        <SimpleInputField
          control={control}
          name="extension_rent"
          label="顺延期租金 (元/月)"
          type="number"
          step="100"
        />
      </div>

      {/* 税费及佣金承担方 */}
      <FormField
        control={control}
        name="cost_assumption_type"
        render={({ field }) => (
          <FormItem>
            <FormLabel>税费及佣金承担方</FormLabel>
            <FormControl>
              <RadioGroup
                onValueChange={field.onChange}
                value={field.value}
                className="flex flex-wrap gap-4"
              >
                {COST_ASSUMPTION_OPTIONS.map((option) => (
                  <FormItem key={option.value} className="flex items-center space-x-2 space-y-0">
                    <FormControl>
                      <RadioGroupItem value={option.value} />
                    </FormControl>
                    <FormLabel className="font-normal cursor-pointer">
                      {option.label}
                    </FormLabel>
                  </FormItem>
                ))}
              </RadioGroup>
            </FormControl>
          </FormItem>
        )}
      />

      {/* 其他选项的手动填写输入框 */}
      {costAssumptionType === "other" && (
        <FormField
          control={control}
          name="cost_assumption_other"
          render={({ field }) => (
            <FormItem>
              <FormLabel>其他说明</FormLabel>
              <FormControl>
                <Input
                  placeholder="请填写具体承担方式"
                  {...field}
                  value={field.value || ""}
                />
              </FormControl>
            </FormItem>
          )}
        />
      )}

      {/* 其他约定条款 */}
      <SimpleTextareaField
        control={control}
        name="other_agreements"
        label="其他约定条款"
        placeholder="请输入其他约定条款..."
      />
    </div>
  );
}
