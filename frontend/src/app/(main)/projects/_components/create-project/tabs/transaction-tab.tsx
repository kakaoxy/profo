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
          name="signing_period"
          label="签约周期 (天)"
          type="number"
        />
      </div>

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
    </div>
  );
}
