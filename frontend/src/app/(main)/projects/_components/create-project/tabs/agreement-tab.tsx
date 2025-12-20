"use client";

import { UseFormReturn } from "react-hook-form";
import { FormValues } from "../schema";
import { SimpleInputField, SimpleTextareaField } from "../form-components";
// 引入你之前写好的 DatePickerField
import { DatePickerField } from "../date-picker-field";

export function AgreementTab({ form }: { form: UseFormReturn<FormValues> }) {
  const { control } = form;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <DatePickerField
          control={control}
          name="signing_date"
          label="签约日期"
        />
        <DatePickerField
          control={control}
          name="planned_handover_date"
          label="计划交房时间"
        />
      </div>

      <SimpleInputField
        control={control}
        name="costAssumption"
        label="税费及佣金承担"
        placeholder="如：各付各税"
      />
      <SimpleInputField
        control={control}
        name="otherAgreements"
        label="其他约定"
      />
      <SimpleTextareaField
        control={control}
        name="notes"
        label="内部备注"
        placeholder="仅内部可见..."
      />
      <SimpleInputField
        control={control}
        name="remarks"
        label="公开备注"
        placeholder="对外可见..."
      />
    </div>
  );
}
