"use client";

import { UseFormReturn } from "react-hook-form";
import { FormValues } from "../schema";
import { SimpleInputField } from "../form-components";

export function OwnerTab({ form }: { form: UseFormReturn<FormValues> }) {
  const { control } = form;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <SimpleInputField
          control={control}
          name="owner_name"
          label="业主姓名"
        />
        <SimpleInputField
          control={control}
          name="owner_phone"
          label="联系电话"
        />
      </div>
      <SimpleInputField
        control={control}
        name="owner_id_card"
        label="身份证号"
        placeholder="18位身份证号"
      />
    </div>
  );
}
