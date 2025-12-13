"use client";

import { UseFormReturn } from "react-hook-form";
import { FormValues } from "../schema";
import { SimpleInputField } from "../form-components";

export function TransactionTab({ form }: { form: UseFormReturn<FormValues> }) {
  const { control } = form;

  return (
    <div className="space-y-5">
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
          name="area"
          label="产证面积 (㎡)"
          type="number"
          step="0.01"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <SimpleInputField
          control={control}
          name="signing_period"
          label="签约周期 (天)"
          type="number"
        />
        <SimpleInputField
          control={control}
          name="extensionPeriod"
          label="顺延期 (月)"
          type="number"
        />
      </div>

      <SimpleInputField
        control={control}
        name="extensionRent"
        label="顺延期租金 (元/月)"
        type="number"
        step="100"
      />
    </div>
  );
}
