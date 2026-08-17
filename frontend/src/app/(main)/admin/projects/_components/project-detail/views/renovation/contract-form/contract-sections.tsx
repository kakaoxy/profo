"use client";

import { Eye } from "lucide-react";
import { format } from "date-fns";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { HasPermission } from "@/components/has-permission";
import { PERMISSION_CODES } from "@/lib/auth/permissions";
import { isValidUrl } from "@/lib/validators";
import { cn } from "@/lib/utils";
import { DatePickerField, NumberInputField, TextInputField } from "./form-fields";
import { formatWanAmount } from "./cost-summary";
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

/** 设计稿 .group-title：13px 大写 graphite + 右侧分隔线（间距由外层 space-y 控制） */
function GroupTitle({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="flex items-center gap-2 text-[13px] font-[500] uppercase tracking-[0.05em] text-graphite after:h-px after:flex-1 after:bg-[#f0f0f2]">
      {children}
    </h4>
  );
}

/** 设计稿 .info-item：k 13px graphite / v 14.5px ink 450，下边框 #f0f0f2，两列网格 */
function InfoItem({
  k,
  v,
  muted,
  strong,
  full,
  children,
}: {
  k: string;
  v?: string;
  muted?: boolean;
  strong?: boolean;
  full?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-[3px] border-b border-[#f0f0f2] py-[13px]",
        full && "col-span-2",
      )}
    >
      <span className="text-[13px] font-[430] text-graphite">{k}</span>
      {children ?? (
        <span
          className={cn(
            "flex flex-wrap items-center gap-2 text-[14.5px] text-ink",
            strong ? "font-[480]" : "font-[450]",
            muted && "font-[400] text-dove",
          )}
        >
          {v}
        </span>
      )}
    </div>
  );
}

/** 日期展示（设计稿「2026.08.22」）；缺失显示「-」 */
function formatDateDisplay(value: Date | undefined): string {
  if (!value || Number.isNaN(value.getTime())) return "-";
  return format(value, "yyyy.MM.dd");
}

/** 设计稿 mini-link：13px graphite + 眼睛图标，hover 转 ink */
function MiniLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-[13px] font-[430] text-graphite transition-colors hover:text-ink"
    >
      <Eye className="h-[13px] w-[13px]" />
      {children}
    </a>
  );
}

// 装修公司信息（设计稿 1282-1288）
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
  const contactPersonName = selectedUser ? selectedUser.nickname || selectedUser.username : "-";

  // 只读态：info-grid 两列展示
  if (!isEditing) {
    return (
      <div>
        <GroupTitle>公司信息</GroupTitle>
        <div className="mt-1 grid grid-cols-2 gap-x-8">
          <InfoItem k="装修公司" v={values.renovation_company || "-"} />
          <InfoItem k="对接负责人" v={contactPersonName} />
        </div>
      </div>
    );
  }

  return (
    <div>
      <GroupTitle>公司信息</GroupTitle>
      <div className="mt-1 grid grid-cols-2 gap-3">
        <TextInputField
          label="装修公司"
          value={values.renovation_company}
          onChange={(v) => setValue("renovation_company", v)}
          placeholder="请输入装修公司名称"
          disabled={!isEditing}
        />
        <div className="space-y-2">
          <Label className="text-xs font-medium text-muted-foreground">对接负责人</Label>
          <HasPermission
            code={PERMISSION_CODES.PROJECT_SALES_MANAGE_TEAM}
            fallback={
              <div className="flex h-9 items-center text-sm text-foreground">
                {contactPersonName}
              </div>
            }
          >
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
          </HasPermission>
        </div>
      </div>
    </div>
  );
}

// 时间信息（合同时间+实际时间合并；设计稿 1289-1295）
export function TimeSection({ values, setValue, isEditing }: ContractSectionsProps) {
  // 只读态：实际竣工缺失显示「未竣工」（设计稿 muted 弱化）
  if (!isEditing) {
    return (
      <div>
        <GroupTitle>时间信息</GroupTitle>
        <div className="mt-1 grid grid-cols-2 gap-x-8">
          <InfoItem k="约定进场" v={formatDateDisplay(values.contract_start_date)} />
          <InfoItem k="约定竣工" v={formatDateDisplay(values.contract_end_date)} />
          <InfoItem k="实际开工" v={formatDateDisplay(values.actual_start_date)} />
          <InfoItem
            k="实际竣工"
            v={values.actual_end_date ? formatDateDisplay(values.actual_end_date) : "未竣工"}
            muted={!values.actual_end_date}
          />
        </div>
      </div>
    );
  }

  return (
    <div>
      <GroupTitle>时间信息</GroupTitle>
      <div className="mt-1 grid grid-cols-2 gap-3">
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

// 装修费用（硬装合同额+软装预算+定制柜+窗户更换+墙面处理；设计稿 1296-1306）
export function DecorationCostSection({ values, setValue, isEditing }: ContractSectionsProps) {
  // 只读态：金额统一「N.N 万元」；软装明细附件全宽 + 预览 mini-link
  if (!isEditing) {
    const attachment = values.soft_detail_attachment?.trim();
    return (
      <div>
        <GroupTitle>装修费用</GroupTitle>
        <div className="mt-1 grid grid-cols-2 gap-x-8">
          <InfoItem k="硬装合同额" v={formatWanAmount(values.hard_contract_amount)} />
          <InfoItem k="软装预算" v={formatWanAmount(values.soft_budget)} />
          <InfoItem k="定制柜" v={formatWanAmount(values.custom_cabinet_amount)} />
          <InfoItem k="窗户更换" v={formatWanAmount(values.window_amount)} />
          <InfoItem k="墙面处理" v={formatWanAmount(values.wall_treatment_amount)} />
          <InfoItem k="软装明细附件" full>
            {attachment ? (
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate text-[14.5px] font-[450] text-ink">{attachment}</span>
                {isValidUrl(attachment) && <MiniLink href={attachment}>预览</MiniLink>}
              </span>
            ) : (
              <span className="text-[14.5px] font-[400] text-dove">-</span>
            )}
          </InfoItem>
        </div>
      </div>
    );
  }

  return (
    <div>
      <GroupTitle>装修费用</GroupTitle>
      <div className="mt-1 grid grid-cols-3 gap-3">
        <NumberInputField
          label="硬装合同额"
          value={values.hard_contract_amount}
          onChange={(v) => setValue("hard_contract_amount", v)}
          placeholder="硬装金额"
          disabled={!isEditing}
          suffix="元"
        />
        <NumberInputField
          label="软装预算"
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
          label="窗户更换"
          value={values.window_amount}
          onChange={(v) => setValue("window_amount", v)}
          placeholder="窗户金额"
          disabled={!isEditing}
          suffix="元"
        />
        <NumberInputField
          label="墙面处理"
          value={values.wall_treatment_amount}
          onChange={(v) => setValue("wall_treatment_amount", v)}
          placeholder="墙面金额"
          disabled={!isEditing}
          suffix="元"
        />
        {/* 软装明细附件（full-width 行）：值为链接时可预览，否则按文本展示 */}
        <div className="col-span-3 space-y-2">
          <Label className="text-xs font-medium text-muted-foreground">软装明细附件</Label>
          <Input
            type="text"
            placeholder="请输入软装明细附件链接"
            value={values.soft_detail_attachment ?? ""}
            onChange={(e) => setValue("soft_detail_attachment", e.target.value)}
            className="h-9 text-sm"
          />
        </div>
      </div>
    </div>
  );
}

// 其他装修（设计稿 1307-1314）
export function OtherFeesSection({ values, setValue, isEditing }: ContractSectionsProps) {
  // 只读态：设计费/拆旧费/清运费/其他 + 全宽其他费用原因
  if (!isEditing) {
    return (
      <div>
        <GroupTitle>其他装修</GroupTitle>
        <div className="mt-1 grid grid-cols-2 gap-x-8">
          <InfoItem k="设计费" v={formatWanAmount(values.design_fee)} />
          <InfoItem k="拆旧费" v={formatWanAmount(values.demolition_fee)} />
          <InfoItem k="清运费" v={formatWanAmount(values.garbage_fee)} />
          <InfoItem k="其他" v={formatWanAmount(values.other_extra_fee)} />
          <InfoItem
            k="其他费用原因"
            v={values.other_fee_reason?.trim() || "-"}
            full
            muted={!values.other_fee_reason?.trim()}
          />
        </div>
      </div>
    );
  }

  return (
    <div>
      <GroupTitle>其他装修</GroupTitle>
      <div className="mt-1 grid grid-cols-4 gap-2">
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
      <div className="mt-3 space-y-1">
        <Label className="text-xs font-medium text-muted-foreground">其他费用原因</Label>
        <Textarea
          placeholder="请说明其他装修的产生原因..."
          value={values.other_fee_reason || ""}
          onChange={(e) => setValue("other_fee_reason", e.target.value)}
          disabled={!isEditing}
          className="min-h-[50px] resize-none py-2 text-xs"
        />
      </div>
    </div>
  );
}
