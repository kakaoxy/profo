"use client";

import { useCallback, useState } from "react";
import { type Control } from "react-hook-form";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup } from "@/components/ui/radio-group";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";

import { FormValues } from "../../../../../_components/create-project/schema";
import {
  SimpleInputField,
  SimpleTextareaField,
} from "../../../../../_components/create-project/form-components";
import { DatePickerField } from "../../../../../_components/create-project/date-picker-field";

/**
 * 就地编辑器表单字段子组件（V4.3 从 info-inline-editor.tsx 拆出，保持 <500 行规范）：
 * 分组标题 / 户型数字输入 / 银行卡聚焦按需解密输入。
 * 仅被 InfoInlineEditor 使用。
 */

/** 分组标题（与只读 InfoTab 的 GroupTitle 同款视觉） */
export function GroupTitle({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-1 flex items-center gap-2", className)}>
      <h4 className="shrink-0 text-[13px] font-medium uppercase tracking-[0.05em] text-graphite">
        {children}
      </h4>
      <span className="h-px flex-1 bg-[#f0f0f2]" aria-hidden />
    </div>
  );
}

/** 户型数字输入（与弹窗 BasicInfoTab 同款） */
export function RoomNumberField({
  control,
  name,
  placeholder,
}: {
  control: Control<FormValues>;
  name: "rooms" | "halls" | "bathrooms";
  placeholder: string;
}) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className="flex-1">
          <FormControl>
            <Input
              type="number"
              min={0}
              step={1}
              placeholder={placeholder}
              {...field}
              value={field.value ?? ""}
              onChange={(e) => {
                const val = e.target.value;
                field.onChange(val === "" ? undefined : parseInt(val, 10));
              }}
              className="rounded-inputs h-10 text-center border-dove/50 bg-pure-white focus-visible:border-ink/30 focus-visible:ring-ink/10"
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

/** 银行卡编辑：后端下发为脱敏值，聚焦输入框时按需拉取完整卡号回填（避免把脱敏值写回） */
export function BankCardField({
  control,
  name,
  ownerId,
  loadFullCard,
}: {
  control: Control<FormValues>;
  name: `owners.${number}.bank_card_number`;
  ownerId?: string;
  /** 聚焦时回调：拉取完整卡号后由父组件 setValue 回填 */
  loadFullCard: () => Promise<void>;
}) {
  const [loading, setLoading] = useState(false);

  const handleFocus = useCallback(async () => {
    if (!ownerId) return;
    setLoading(true);
    try {
      await loadFullCard();
    } finally {
      setLoading(false);
    }
  }, [ownerId, loadFullCard]);

  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel className="mb-2 block text-[14px] font-medium text-foreground tracking-tight">
            银行卡号
          </FormLabel>
          <FormControl>
            <div className="relative">
              <Input
                type="text"
                placeholder="点击获取原卡号后修改"
                {...field}
                value={field.value || ""}
                onFocus={handleFocus}
                className="rounded-inputs h-10 border-dove/50 bg-pure-white placeholder:text-dove focus-visible:border-ink/30 focus-visible:ring-ink/10"
              />
              {loading && (
                <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-graphite" />
              )}
            </div>
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

/**
 * 合同要件表单段（V4.3 从 info-inline-editor.tsx 拆出）：
 * 合同编号 / 日期区间 / 价格与周期 / 税费承担方等字段 + 周期手动输入开关。
 */
export function ContractEssentialsSection({
  control,
  manualPeriod,
  onManualPeriodChange,
  costAssumptionType,
}: {
  control: Control<FormValues>;
  manualPeriod: boolean;
  onManualPeriodChange: (v: boolean) => void;
  costAssumptionType: string | undefined;
}) {
  return (
    <>
      <GroupTitle className="mt-5">合同要件</GroupTitle>
      <div className="grid grid-cols-1 gap-x-5 gap-y-4 py-3 sm:grid-cols-2">
        <SimpleInputField control={control} name="contract_no" label="合同编号" required />
        <DatePickerField control={control} name="signing_date" label="签约日期" />
        <DatePickerField control={control} name="planned_handover_date" label="业主交房时间" />
        <DatePickerField control={control} name="commission_start_date" label="委托开始日期" />
        <DatePickerField control={control} name="commission_end_date" label="委托结束日期" />
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
              <div className="mb-2 flex items-center justify-between">
                <FormLabel className="text-[14px] font-medium text-foreground tracking-tight">
                  合同周期 (天)
                </FormLabel>
                <label className="flex cursor-pointer items-center gap-1.5">
                  <Checkbox
                    checked={manualPeriod}
                    onCheckedChange={(checked) => onManualPeriodChange(checked === true)}
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
                  {[
                    { value: "meifangbao", label: "美房宝承担" },
                    { value: "owner", label: "业主承担" },
                    { value: "respective", label: "各自承担" },
                    { value: "other", label: "其他" },
                  ].map((option) => (
                    <label
                      key={option.value}
                      className={cn(
                        "inline-flex cursor-pointer items-center gap-2 rounded-full border px-4 py-2 text-[13px] font-medium transition-all",
                        field.value === option.value
                          ? "border-ink bg-ink text-pure-white"
                          : "border-dove/50 bg-pure-white text-graphite hover:border-dove hover:bg-fog/50",
                      )}
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
              <FormMessage />
            </FormItem>
          )}
        />
        {costAssumptionType === "other" && (
          <SimpleInputField control={control} name="cost_assumption_other" label="其他说明" />
        )}
      </div>
      <div className="mt-4">
        <SimpleTextareaField
          control={control}
          name="other_agreements"
          label="其他约定条款"
          placeholder="请输入其他约定条款..."
        />
      </div>
    </>
  );
}
