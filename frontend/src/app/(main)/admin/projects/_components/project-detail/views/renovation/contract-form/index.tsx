"use client";

import { logger } from "@/lib/logger";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { format } from "date-fns";
import { Loader2, Save, Edit2 } from "lucide-react";

import { Button } from "@/components/ui/button";

import { renovationContractSchema, RenovationContractFormValues } from "./schema";
import {
  getRenovationContractAction,
  updateRenovationContractAction,
} from "../../../../../actions/renovation";
import { getSalesUsersSimpleAction } from "../../../../../actions/sales";
import {
  CompanySection,
  TimeSection,
  DecorationCostSection,
  OtherFeesSection,
  type UserOption,
} from "./contract-sections";
import { CostSummarySection } from "./cost-summary";

interface RenovationContractFormProps {
  projectId: string;
  area?: number;
}

// 后端 Decimal 字段经 JSON 序列化为字符串，需显式转为 number
function toNumber(v: unknown): number | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  if (typeof v === "number") return isNaN(v) ? undefined : v;
  const n = Number(v);
  return isNaN(n) ? undefined : n;
}

export function RenovationContractForm({ projectId, area }: RenovationContractFormProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);

  const form = useForm<RenovationContractFormValues>({
    resolver: zodResolver(renovationContractSchema),
    defaultValues: {
      renovation_company: "",
      contact_person_id: "",
      contract_start_date: undefined,
      contract_end_date: undefined,
      actual_start_date: undefined,
      actual_end_date: undefined,
      hard_contract_amount: undefined,
      soft_budget: undefined,
      soft_detail_attachment: "",
      custom_cabinet_amount: undefined,
      window_amount: undefined,
      wall_treatment_amount: undefined,
      design_fee: undefined,
      demolition_fee: undefined,
      garbage_fee: undefined,
      other_extra_fee: undefined,
      other_fee_reason: "",
    },
  });

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // 加载内部用户列表（用于对接负责人下拉）
  // 失败时用 toast 提示而非 setError，避免整个表单被错误卡片替换阻塞编辑
  useEffect(() => {
    getSalesUsersSimpleAction()
      .then((result) => {
        if (result.success && result.data) {
          setUsers(result.data);
        } else {
          toast.error(result.message || "获取用户列表失败");
        }
      })
      .catch(() => toast.error("加载用户列表失败"))
      .finally(() => setIsLoadingUsers(false));
  }, []);

  useEffect(() => {
    async function loadContractData() {
      try {
        setIsLoading(true);
        setError(null);
        const result = await getRenovationContractAction(projectId);

        if (result.success && result.data) {
          const data = result.data as Record<string, unknown>;
          form.reset({
            renovation_company: (data.renovation_company as string) || "",
            contact_person_id: (data.contact_person_id as string) || "",
            contract_start_date: data.contract_start_date
              ? new Date(data.contract_start_date as string)
              : undefined,
            contract_end_date: data.contract_end_date
              ? new Date(data.contract_end_date as string)
              : undefined,
            actual_start_date: data.actual_start_date
              ? new Date(data.actual_start_date as string)
              : undefined,
            actual_end_date: data.actual_end_date
              ? new Date(data.actual_end_date as string)
              : undefined,
            hard_contract_amount: toNumber(data.hard_contract_amount),
            soft_budget: toNumber(data.soft_budget),
            soft_detail_attachment: (data.soft_detail_attachment as string) || "",
            custom_cabinet_amount: toNumber(data.custom_cabinet_amount),
            window_amount: toNumber(data.window_amount),
            wall_treatment_amount: toNumber(data.wall_treatment_amount),
            design_fee: toNumber(data.design_fee),
            demolition_fee: toNumber(data.demolition_fee),
            garbage_fee: toNumber(data.garbage_fee),
            other_extra_fee: toNumber(data.other_extra_fee),
            other_fee_reason: (data.other_fee_reason as string) || "",
          });
        } else {
          setError(result.message || "加载数据失败");
        }
      } catch (err) {
        setError("加载数据时发生错误");
        logger.error("加载装修合同数据失败:", err);
      } finally {
        setIsLoading(false);
      }
    }

    loadContractData();
  }, [projectId, form]);

  const handleSave = async (values: RenovationContractFormValues) => {
    try {
      setIsSaving(true);

      const payload = {
        ...values,
        contract_start_date: values.contract_start_date
          ? format(values.contract_start_date, "yyyy-MM-dd")
          : undefined,
        contract_end_date: values.contract_end_date
          ? format(values.contract_end_date, "yyyy-MM-dd")
          : undefined,
        actual_start_date: values.actual_start_date
          ? format(values.actual_start_date, "yyyy-MM-dd")
          : undefined,
        actual_end_date: values.actual_end_date
          ? format(values.actual_end_date, "yyyy-MM-dd")
          : undefined,
      };

      const result = await updateRenovationContractAction(projectId, payload);

      if (result.success) {
        toast.success("装修合同信息已保存");
        setIsEditing(false);
      } else {
        toast.error(result.message || "保存失败");
      }
    } catch (err) {
      toast.error("保存时发生错误");
      logger.error("保存装修合同数据失败:", err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    window.location.reload();
  };

  if (!isMounted || isLoading) {
    return (
      <div className="rounded-cards bg-pure-white p-6 shadow-steep">
        <div className="flex items-center justify-center text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          <span className="text-xs">加载中...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-cards bg-pure-white p-6 shadow-steep">
        <div className="text-center text-xs text-error">{error}</div>
      </div>
    );
  }

  const { watch, setValue } = form;
  const values = watch();

  return (
    // 设计稿 .card：白卡 24px 圆角 + 签名阴影 + 24px 内边距（无边框）
    <div className="rounded-cards bg-pure-white p-6 shadow-steep">
      {/* 卡头：标题 16px/500 + 副标题 + 右操作（查看态 textlink 编辑 / 编辑态 btn-sm 取消·保存） */}
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <div className="text-[16px] font-[500] text-ink">装修合同信息</div>
          <div className="mt-0.5 text-[13px] font-[430] text-graphite">
            合同要素与费用构成 · 保存后即时生效
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {isEditing ? (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCancel}
                disabled={isSaving}
                className="h-[30px] rounded-full border-[#e2e2e5] bg-pure-white px-[14px] text-[13.5px] font-[450] text-ink hover:border-dove hover:bg-[#fafafa]"
              >
                取消
              </Button>
              <Button
                size="sm"
                onClick={form.handleSubmit(handleSave)}
                disabled={isSaving}
                className="h-[30px] rounded-full border border-ink bg-ink px-[14px] text-[13.5px] font-[450] text-pure-white hover:bg-[#26282c]"
              >
                {isSaving ? (
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                ) : (
                  <Save className="mr-1 h-3 w-3" />
                )}
                保存
              </Button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              className="inline-flex items-center gap-1.5 bg-none text-[14px] font-[450] text-ink transition-colors hover:underline hover:underline-offset-4"
            >
              <Edit2 className="h-[15px] w-[15px]" />
              编辑
            </button>
          )}
        </div>
      </div>

      {/* 分区内容（设计稿 .group-title 间距 22px，编辑态保留原表单控件） */}
      <div className="space-y-[22px]">
        <CompanySection
          values={values}
          setValue={setValue}
          isEditing={isEditing}
          users={users}
          isLoadingUsers={isLoadingUsers}
        />
        <TimeSection values={values} setValue={setValue} isEditing={isEditing} />
        <DecorationCostSection values={values} setValue={setValue} isEditing={isEditing} />
        <OtherFeesSection values={values} setValue={setValue} isEditing={isEditing} />
        <CostSummarySection values={values} area={area} />
      </div>
    </div>
  );
}
