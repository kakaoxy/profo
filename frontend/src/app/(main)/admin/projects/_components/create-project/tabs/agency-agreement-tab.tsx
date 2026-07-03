"use client";

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
import { RadioGroup } from "@/components/ui/radio-group";
import { Input } from "@/components/ui/input";

const COST_ASSUMPTION_OPTIONS = [
  { value: "meifangbao", label: "美房宝承担" },
  { value: "owner", label: "业主承担" },
  { value: "respective", label: "各自承担" },
  { value: "other", label: "其他" },
] as const;

export function AgencyAgreementTab({ form }: { form: UseFormReturn<FormValues> }) {
  const { control } = form;

  const costAssumptionType = useWatch({
    control,
    name: "cost_assumption_type",
  });

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

      {/* 委托期限日期范围 */}
      <div className="grid grid-cols-2 gap-4">
        <DatePickerField
          control={control}
          name="commission_start_date"
          label="委托开始日期"
        />
        <DatePickerField
          control={control}
          name="commission_end_date"
          label="委托结束日期"
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

      {/* 税费及佣金承担方 — Steep: pill-style radio chips */}
      <FormField
        control={control}
        name="cost_assumption_type"
        render={({ field }) => (
          <FormItem className="space-y-3">
            <FormLabel className="text-[14px] font-medium text-foreground tracking-tight">税费及佣金承担方</FormLabel>
            <FormControl>
              <RadioGroup
                onValueChange={field.onChange}
                value={field.value}
                className="flex flex-wrap gap-2"
              >
                {COST_ASSUMPTION_OPTIONS.map((option) => (
                  <label
                    key={option.value}
                    className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-[13px] font-medium cursor-pointer transition-all border ${
                      field.value === option.value
                        ? "bg-ink text-pure-white border-ink"
                        : "bg-pure-white text-graphite border-dove/50 hover:border-dove hover:bg-fog/50"
                    }`}
                  >
                    <input
                      type="radio"
                      value={option.value}
                      checked={field.value === option.value}
                      onChange={() => field.onChange(option.value)}
                      className="sr-only"
                    />
                    {option.label}
                  </label>
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
              <FormLabel className="text-[14px] font-medium text-foreground tracking-tight">其他说明</FormLabel>
              <FormControl>
                <Input
                  placeholder="请填写具体承担方式"
                  {...field}
                  value={field.value || ""}
                  className="rounded-inputs h-10 border-dove/50 bg-pure-white placeholder:text-dove focus-visible:border-ink/30 focus-visible:ring-ink/10"
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
