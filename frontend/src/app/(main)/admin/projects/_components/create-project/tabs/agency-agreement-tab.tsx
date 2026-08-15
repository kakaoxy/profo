"use client";

import { useEffect, useState } from "react";
import { UseFormReturn, useWatch } from "react-hook-form";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { logger } from "@/lib/logger";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { RadioGroup } from "@/components/ui/radio-group";

import { getNextContractNoAction } from "../../../actions/core";
import { FormValues } from "../schema";
import { SimpleInputField, SimpleTextareaField } from "../form-components";
import { DatePickerField } from "../date-picker-field";

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
  const commissionStartDate = useWatch({
    control,
    name: "commission_start_date",
  });
  const commissionEndDate = useWatch({
    control,
    name: "commission_end_date",
  });
  const businessForm = useWatch({
    control,
    name: "business_form",
  });

  const [manualPeriod, setManualPeriod] = useState(false);
  const [dateError, setDateError] = useState<string | null>(null);
  const [contractNoLoading, setContractNoLoading] = useState(false);

  // 自动计算合同周期天数 (end - start + 1，含首尾)
  useEffect(() => {
    if (manualPeriod) return;
    if (!commissionStartDate || !commissionEndDate) {
      setDateError(null);
      return;
    }
    const diffTime = commissionEndDate.getTime() - commissionStartDate.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;
    if (diffDays < 1) {
      setDateError("委托结束日期不能早于开始日期");
      return;
    }
    setDateError(null);
    form.setValue("signing_period", diffDays, { shouldDirty: true });
  }, [commissionStartDate, commissionEndDate, manualPeriod, form]);

  const handleGenerateContractNo = async () => {
    if (businessForm !== "agent" && businessForm !== "wholesale") return;
    setContractNoLoading(true);
    try {
      const result = await getNextContractNoAction(businessForm);
      if (result.success && result.data) {
        form.setValue("contract_no", result.data, { shouldDirty: true });
      } else {
        toast.error(result.message || "生成合同编号失败");
      }
    } catch (e) {
      logger.error("生成合同编号异常:", e);
      toast.error("网络错误，请稍后重试");
    } finally {
      setContractNoLoading(false);
    }
  };

  const canGenerateContractNo = businessForm === "agent" || businessForm === "wholesale";

  return (
    <div className="space-y-5">
      {/* 合同编号 */}
      <FormField
        control={control}
        name="contract_no"
        render={({ field }) => (
          <FormItem>
            <FormLabel className="text-[14px] font-medium text-foreground tracking-tight mb-2">
              合同编号<span className="text-error ml-0.5">*</span>
            </FormLabel>
            <div className="flex gap-2">
              <FormControl>
                <Input
                  placeholder="请输入或生成合同编号"
                  className="rounded-inputs h-10 border-dove/50 bg-pure-white placeholder:text-dove focus-visible:border-ink/30 focus-visible:ring-ink/10 text-[14px]"
                  {...field}
                  value={field.value ?? ""}
                />
              </FormControl>
              <Button
                type="button"
                variant="outline"
                size="default"
                className="h-10 shrink-0 rounded-inputs border-dove/50 hover:bg-fog/50"
                disabled={!canGenerateContractNo || contractNoLoading}
                onClick={handleGenerateContractNo}
              >
                {contractNoLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    生成中
                  </>
                ) : (
                  "生成编号"
                )}
              </Button>
            </div>
            {!canGenerateContractNo && (
              <p className="text-[12px] text-dove mt-1">请先选择业务形式后再生成编号</p>
            )}
            <FormMessage />
          </FormItem>
        )}
      />

      {/* 签约日期 & 业主交房时间 */}
      <div className="grid grid-cols-2 gap-4">
        <DatePickerField control={control} name="signing_date" label="签约日期" />
        <DatePickerField control={control} name="planned_handover_date" label="业主交房时间" />
      </div>

      {/* 委托期限日期范围 */}
      <div className="grid grid-cols-2 gap-4">
        <DatePickerField control={control} name="commission_start_date" label="委托开始日期" />
        <DatePickerField control={control} name="commission_end_date" label="委托结束日期" />
      </div>
      {dateError && <p className="text-[13px] text-error -mt-2">{dateError}</p>}

      {/* 签约价格 & 合同周期 */}
      <div className="grid grid-cols-2 gap-4">
        <SimpleInputField
          control={control}
          name="signing_price"
          label="签约价格 (万)"
          type="number"
          step="0.01"
        />
        <FormField
          control={control}
          name="signing_period"
          render={({ field }) => (
            <FormItem>
              <div className="flex items-center justify-between">
                <FormLabel className="text-[14px] font-medium text-foreground tracking-tight">
                  合同周期 (天)
                </FormLabel>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <Checkbox
                    checked={manualPeriod}
                    onCheckedChange={(checked) => setManualPeriod(checked === true)}
                  />
                  <span className="text-[12px] text-graphite">手动输入</span>
                </label>
              </div>
              <FormControl>
                <Input
                  type="number"
                  placeholder="自动计算"
                  className="rounded-inputs h-10 border-dove/50 bg-pure-white placeholder:text-dove focus-visible:border-ink/30 focus-visible:ring-ink/10 text-[14px]"
                  {...field}
                  value={field.value ?? ""}
                  readOnly={!manualPeriod}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
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
            <FormLabel className="text-[14px] font-medium text-foreground tracking-tight">
              税费及佣金承担方
            </FormLabel>
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
              <FormLabel className="text-[14px] font-medium text-foreground tracking-tight">
                其他说明
              </FormLabel>
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
