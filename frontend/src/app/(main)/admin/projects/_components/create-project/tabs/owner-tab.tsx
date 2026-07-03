"use client";

import { useFieldArray, UseFormReturn } from "react-hook-form";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormValues } from "../schema";
import { SimpleInputField, SimpleTextareaField } from "../form-components";

export function OwnerTab({ form }: { form: UseFormReturn<FormValues> }) {
  const { control } = form;
  const { fields, append, remove } = useFieldArray({ control, name: "owners" });

  return (
    <div className="space-y-5">
      {fields.map((field, index) => (
        <div key={field.id} className="space-y-4 rounded-md border p-4">
          <div className="flex items-center justify-end">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => remove(index)}
              disabled={fields.length <= 1}
            >
              <Trash2 className="mr-1 h-4 w-4" />
              删除业主
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <SimpleInputField
              control={control}
              name={`owners.${index}.owner_name`}
              label="业主姓名"
            />
            <SimpleInputField
              control={control}
              name={`owners.${index}.owner_phone`}
              label="联系电话"
            />
            <SimpleInputField
              control={control}
              name={`owners.${index}.owner_id_card`}
              label="身份证号"
              placeholder="18位身份证号"
            />
            <SimpleInputField
              control={control}
              name={`owners.${index}.bank_name`}
              label="开户行"
            />
            <SimpleInputField
              control={control}
              name={`owners.${index}.bank_card_number`}
              label="银行卡号"
            />
            <SimpleInputField
              control={control}
              name={`owners.${index}.relation_type`}
              label="关系类型"
              placeholder="业主"
            />
          </div>
          <SimpleTextareaField
            control={control}
            name={`owners.${index}.owner_info`}
            label="备注"
          />
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        onClick={() =>
          append({
            owner_name: "",
            owner_phone: "",
            owner_id_card: "",
            bank_name: "",
            bank_card_number: "",
            relation_type: "业主",
            owner_info: "",
          })
        }
      >
        <Plus className="mr-1 h-4 w-4" />
        新增业主
      </Button>
    </div>
  );
}
