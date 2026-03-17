"use client";

import { UseFormReturn } from "react-hook-form";
import { FormValues } from "../schema";
import { SimpleInputField, SimpleTextareaField } from "../form-components";
import { DatePickerField } from "../date-picker-field";

export function AgencyAgreementTab({ form }: { form: UseFormReturn<FormValues> }) {
  const { control } = form;

  return (
    <div className="space-y-5">
      {/* 合同编号 */}
      <SimpleInputField
        control={control}
        name="contract_no"
        label="合同编号"
        placeholder="请输入合同编号"
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
      <SimpleInputField
        control={control}
        name="cost_assumption"
        label="税费及佣金承担方"
        placeholder="如：各付各税"
      />

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
