"use client";

import { useState } from "react";
import { useFieldArray, UseFormReturn } from "react-hook-form";
import { Plus, Trash2, Save, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormValues } from "../schema";
import { SimpleInputField, SimpleTextareaField } from "../form-components";

interface OwnerTabProps {
  form: UseFormReturn<FormValues>;
  /** 手动保存草稿回调（可选，仅在新建模式传入） */
  onSave?: () => void;
}

export function OwnerTab({ form, onSave }: OwnerTabProps) {
  const { control } = form;
  const { fields, append, remove } = useFieldArray({ control, name: "owners" });
  // 保存后锁定表单，给用户「已保存」的安全感；点击「继续编辑」解锁
  const [isLocked, setIsLocked] = useState(false);

  const handleSave = () => {
    onSave?.();
    setIsLocked(true);
  };

  return (
    <div className="space-y-5">
      {isLocked && (
        <div className="flex items-center justify-between rounded-md border border-success/30 bg-success/5 px-4 py-3">
          <span className="text-[13px] font-medium text-success">信息已保存，可继续编辑或直接提交项目</span>
          <Button type="button" variant="outline" size="sm" onClick={() => setIsLocked(false)}>
            <Pencil className="mr-1 h-4 w-4" />
            继续编辑
          </Button>
        </div>
      )}

      <fieldset disabled={isLocked} className="m-0 border-0 p-0 space-y-5">
        {/* 公用事业户号（项目级字段，UI 归属业主信息 tab） */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-[14px] font-medium text-foreground tracking-tight">公用事业户号</h3>
            {onSave && (
              <Button type="button" variant="outline" size="sm" onClick={handleSave}>
                <Save className="mr-1 h-4 w-4" />
                保存信息
              </Button>
            )}
          </div>
          <div className="grid grid-cols-3 gap-4">
            <SimpleInputField
              control={control}
              name="electricity_account"
              label="电表户号"
            />
            <SimpleInputField
              control={control}
              name="water_account"
              label="水表户号"
            />
            <SimpleInputField
              control={control}
              name="gas_account"
              label="煤气户号"
            />
          </div>
        </div>

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
      </fieldset>
    </div>
  );
}
