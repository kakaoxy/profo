"use client";

import {
  Building2,
  Calendar,
  HardHat,
  Receipt,
} from "lucide-react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { DatePickerField, NumberInputField, TextInputField } from "./form-fields";
import { RenovationContractFormValues } from "./schema";
import { UseFormSetValue } from "react-hook-form";

export interface UserOption {
  id: string;
  nickname: string | null;
  username: string;
}

interface ContractSectionsProps {
  values: RenovationContractFormValues;
  setValue: UseFormSetValue<RenovationContractFormValues>;
  isEditing: boolean;
}

// 装修公司信息
export function CompanySection({
  values,
  setValue,
  isEditing,
  users,
  isLoadingUsers,
}: ContractSectionsProps & {
  users: UserOption[];
  isLoadingUsers: boolean;
}) {
  const selectedUser = users.find((u) => u.id === values.contact_person_id);
  const contactPersonName = selectedUser
    ? selectedUser.nickname || selectedUser.username
    : "-";

  return (
    <div className="space-y-2">
      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
        <Building2 className="h-3 w-3" />
        公司信息
      </h4>
      <div className="grid grid-cols-2 gap-3">
        <TextInputField
          label="装修公司"
          value={values.renovation_company}
          onChange={(v) => setValue("renovation_company", v)}
          placeholder="请输入装修公司名称"
          disabled={!isEditing}
        />
        <div className="space-y-2">
          <Label className="text-xs font-medium text-muted-foreground">对接负责人</Label>
          {isEditing ? (
            <Select
              value={values.contact_person_id || "__empty__"}
              onValueChange={(value) => {
                const newValue = value === "__empty__" ? "" : value;
                setValue("contact_person_id", newValue);
              }}
            >
              <SelectTrigger className="h-9 text-sm" disabled={isLoadingUsers}>
                <SelectValue placeholder={isLoadingUsers ? "加载中..." : "未选择"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__empty__">未选择</SelectItem>
                {users.map((user) => (
                  <SelectItem key={user.id} value={user.id}>
                    {user.nickname || user.username}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <div className="h-9 flex items-center text-sm text-foreground">
              {contactPersonName}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// 时间信息（合同时间+实际时间合并）
export function TimeSection({ values, setValue, isEditing }: ContractSectionsProps) {
  return (
    <div className="space-y-2">
      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
        <Calendar className="h-3 w-3" />
        时间信息
      </h4>
      <div className="grid grid-cols-2 gap-3">
        <DatePickerField
          label="约定进场"
          value={values.contract_start_date}
          onChange={(d) => setValue("contract_start_date", d)}
          disabled={!isEditing}
        />
        <DatePickerField
          label="约定竣工"
          value={values.contract_end_date}
          onChange={(d) => setValue("contract_end_date", d)}
          disabled={!isEditing}
        />
        <DatePickerField
          label="实际开工"
          value={values.actual_start_date}
          onChange={(d) => setValue("actual_start_date", d)}
          disabled={!isEditing}
        />
        <DatePickerField
          label="实际竣工"
          value={values.actual_end_date}
          onChange={(d) => setValue("actual_end_date", d)}
          disabled={!isEditing}
        />
      </div>
    </div>
  );
}

// 装修费用（硬装+软装+定制柜+窗户+墙面）
export function DecorationCostSection({ values, setValue, isEditing }: ContractSectionsProps) {
  return (
    <div className="space-y-2">
      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
        <HardHat className="h-3 w-3" />
        装修费用
      </h4>
      <div className="grid grid-cols-3 gap-3">
        <NumberInputField
          label="硬装"
          value={values.hard_contract_amount}
          onChange={(v) => setValue("hard_contract_amount", v)}
          placeholder="硬装金额"
          disabled={!isEditing}
          suffix="元"
        />
        <NumberInputField
          label="软装"
          value={values.soft_budget}
          onChange={(v) => setValue("soft_budget", v)}
          placeholder="软装金额"
          disabled={!isEditing}
          suffix="元"
        />
        <NumberInputField
          label="定制柜"
          value={values.custom_cabinet_amount}
          onChange={(v) => setValue("custom_cabinet_amount", v)}
          placeholder="定制柜金额"
          disabled={!isEditing}
          suffix="元"
        />
        <NumberInputField
          label="窗户"
          value={values.window_amount}
          onChange={(v) => setValue("window_amount", v)}
          placeholder="窗户金额"
          disabled={!isEditing}
          suffix="元"
        />
        <NumberInputField
          label="墙面"
          value={values.wall_treatment_amount}
          onChange={(v) => setValue("wall_treatment_amount", v)}
          placeholder="墙面金额"
          disabled={!isEditing}
          suffix="元"
        />
      </div>
    </div>
  );
}

// 其他装修（4列紧凑布局）
export function OtherFeesSection({ values, setValue, isEditing }: ContractSectionsProps) {
  return (
    <div className="space-y-2">
      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
        <Receipt className="h-3 w-3" />
        其他装修
      </h4>
      <div className="grid grid-cols-4 gap-2">
        <NumberInputField
          label="设计费"
          value={values.design_fee}
          onChange={(v) => setValue("design_fee", v)}
          placeholder="设计费"
          disabled={!isEditing}
          suffix="元"
        />
        <NumberInputField
          label="拆旧费"
          value={values.demolition_fee}
          onChange={(v) => setValue("demolition_fee", v)}
          placeholder="拆旧费"
          disabled={!isEditing}
          suffix="元"
        />
        <NumberInputField
          label="清运费"
          value={values.garbage_fee}
          onChange={(v) => setValue("garbage_fee", v)}
          placeholder="清运费"
          disabled={!isEditing}
          suffix="元"
        />
        <NumberInputField
          label="其他"
          value={values.other_extra_fee}
          onChange={(v) => setValue("other_extra_fee", v)}
          placeholder="其他装修"
          disabled={!isEditing}
          suffix="元"
        />
      </div>
      <div className="space-y-1">
        <Label className="text-[10px] font-medium text-muted-foreground">其他装修原因</Label>
        <Textarea
          placeholder="请说明其他装修的产生原因..."
          value={values.other_fee_reason || ""}
          onChange={(e) => setValue("other_fee_reason", e.target.value)}
          disabled={!isEditing}
          className="min-h-[50px] text-xs resize-none py-2"
        />
      </div>
    </div>
  );
}
