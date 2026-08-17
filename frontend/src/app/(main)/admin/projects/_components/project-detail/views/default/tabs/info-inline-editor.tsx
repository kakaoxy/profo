"use client";

import { useCallback, useEffect, useState } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { logger } from "@/lib/logger";

import { RadioGroup } from "@/components/ui/radio-group";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Form,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CommunitySelect } from "@/components/common/community-select";
import { FloorInput } from "@/components/common";

import { Project } from "../../../../../types";
import {
  FormValues,
  ORIENTATION_OPTIONS,
  BUSINESS_FORM_OPTIONS,
} from "../../../../../_components/create-project/schema";
import {
  getFormResolver,
  getDefaultValues,
} from "../../../../../_components/create-project/use-form-init";
import {
  buildProjectUpdatePayload,
  syncCommunityDistrict,
} from "../../../../../_components/create-project/utils";
import {
  SimpleInputField,
  SimpleTextareaField,
} from "../../../../../_components/create-project/form-components";
import { updateProjectAction, getOwnerBankCardAction } from "../../../../../actions/core";
import { getSalesUsersSimpleAction } from "../../../../../actions/sales";
import {
  GroupTitle,
  RoomNumberField,
  BankCardField,
  ContractEssentialsSection,
} from "./info-editor-fields";

interface InfoInlineEditorProps {
  project: Project;
  /** 页面级用户列表（userId → 展示名）；未传时内部自行加载（旧抽屉等场景兜底） */
  usersById?: Map<string, string>;
  onCancel: () => void;
  /** 保存成功后回调（父组件局部刷新 + 退出编辑态） */
  onSaved: () => void;
}

/**
 * 项目信息就地编辑器（V4.3：替代编辑弹窗，卡片原位编辑）
 *
 * - 表单体系完全复用 create-project：formSchema 校验 + getDefaultValues 初值 +
 *   buildProjectUpdatePayload 保存 payload（弹窗与就地编辑共用同一组装逻辑）。
 * - 分组与只读 InfoTab 对齐：房源信息 / 业主信息（含公用事业户号）/ 合同要件 / 备注。
 * - 保存成功 → toast + 父组件局部刷新（onSaved）；取消 → 丢弃修改。
 * - 字段子组件（GroupTitle/RoomNumberField/BankCardField）见 info-editor-fields.tsx。
 */
export function InfoInlineEditor({ project, usersById, onCancel, onSaved }: InfoInlineEditorProps) {
  const form = useForm<FormValues>({
    resolver: getFormResolver(),
    defaultValues: getDefaultValues(project, true),
  });
  const { control } = form;
  const { fields, append, remove } = useFieldArray({ control, name: "owners" });
  const [saving, setSaving] = useState(false);

  // 项目负责人下拉用户列表：优先同步页面级 usersById（Map 变化时响应式更新）；
  // usersById 为空/未就绪时自行加载兜底（原实现 useState 惰性初始化只跑一次，
  // 且空 Map 为 truthy 导致兜底加载被跳过 → 下拉可能永远为空，修复）
  const [users, setUsers] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    if (usersById && usersById.size > 0) {
      setUsers(Array.from(usersById.entries()).map(([id, name]) => ({ id, name })));
      return;
    }
    let mounted = true;
    getSalesUsersSimpleAction()
      .then((result) => {
        if (mounted && result.success && result.data) {
          setUsers(result.data.map((u) => ({ id: u.id, name: u.nickname || u.username || u.id })));
        }
      })
      .catch(() => {
        // 兜底失败保持空列表（action 内部已 try/catch，此处防御未预期异常）
        if (mounted) setUsers([]);
      });
    return () => {
      mounted = false;
    };
  }, [usersById]);

  // 合同周期自动计算（委托起止 → 天数；与弹窗 AgencyAgreementTab 同逻辑）
  const commissionStart = useWatch({ control, name: "commission_start_date" });
  const commissionEnd = useWatch({ control, name: "commission_end_date" });
  const costAssumptionType = useWatch({ control, name: "cost_assumption_type" });
  const [manualPeriod, setManualPeriod] = useState(false);
  useEffect(() => {
    if (manualPeriod) return;
    if (!commissionStart || !commissionEnd) return;
    const diffDays =
      Math.floor((commissionEnd.getTime() - commissionStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    if (diffDays >= 1) {
      form.setValue("signing_period", diffDays, { shouldDirty: true });
    }
  }, [commissionStart, commissionEnd, manualPeriod, form]);

  // 银行卡编辑：聚焦时按需拉取完整卡号回填（后端下发为脱敏值，避免脱敏值被写回）
  const loadFullCard = useCallback(
    async (index: number) => {
      const ownerId = project.owners?.[index]?.id;
      if (!ownerId) return;
      // 当前表单值已是明文（无 *）则不重复拉取
      const current = form.getValues(`owners.${index}.bank_card_number`);
      if (current && !current.includes("*")) return;
      try {
        const result = await getOwnerBankCardAction(ownerId);
        if (result.success && result.data) {
          form.setValue(`owners.${index}.bank_card_number`, result.data);
        }
      } catch {
        // 拉取失败保持脱敏值，不阻塞编辑
      }
    },
    [project.owners, form],
  );

  const handleSubmit = async (values: FormValues) => {
    setSaving(true);
    try {
      const res = await updateProjectAction(project.id, buildProjectUpdatePayload(values));
      if (!res.success) {
        toast.error(res.message || "保存失败");
        return;
      }
      toast.success("项目信息已更新");
      // 行政区/商圈回写小区（失败不阻塞）
      const communityRes = await syncCommunityDistrict(values);
      if (!communityRes.success) {
        toast.error("小区信息更新失败" + (communityRes.message ? `：${communityRes.message}` : ""));
      }
      onSaved();
    } catch (error) {
      logger.error("就地编辑保存异常", error);
      toast.error("网络请求错误，请重试");
    } finally {
      setSaving(false);
    }
  };

  return (
    // FormProvider 包裹（shadcn FormField/FormItem/FormMessage 依赖 useFormContext，
    // 直接 useForm() 而不包 Form 会报 "Cannot destructure property 'getFieldState'"）
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(handleSubmit, () => {
          toast.error("表单校验失败，请检查必填字段（小区名称/详细地址/合同编号/至少一位业主）");
        })}
        className="font-sohne"
      >
        {/* --- 房源信息 --- */}
        <GroupTitle>房源信息</GroupTitle>
        <div className="grid grid-cols-1 gap-x-5 gap-y-4 py-3 sm:grid-cols-2">
          <FormField
            control={control}
            name="community_name"
            render={({ field }) => (
              <FormItem className="space-y-1.5">
                <FormControl>
                  <CommunitySelect
                    value={field.value}
                    onChange={(community) => {
                      field.onChange(community.name);
                      form.setValue("community_id", community.id || undefined);
                      form.setValue("district", community.district || "");
                      form.setValue("original_community_district", community.district || "");
                      form.setValue("business_circle", community.businessCircle || "");
                      form.setValue(
                        "original_community_business_circle",
                        community.businessCircle || "",
                      );
                    }}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <SimpleInputField control={control} name="address" label="详细地址" required />
          <SimpleInputField
            control={control}
            name="area"
            label="产证面积 (㎡)"
            type="number"
            step="0.01"
          />
          <FormItem>
            <FormLabel className="mb-2 block text-[14px] font-medium text-foreground tracking-tight">
              户型
              <span className="ml-1 text-[12px] font-normal text-graphite">（至少填写一项）</span>
            </FormLabel>
            <div className="flex items-center gap-2">
              <RoomNumberField control={control} name="rooms" placeholder="2" />
              <span className="shrink-0 text-[13px] text-graphite">室</span>
              <RoomNumberField control={control} name="halls" placeholder="1" />
              <span className="shrink-0 text-[13px] text-graphite">厅</span>
              <RoomNumberField control={control} name="bathrooms" placeholder="1" />
              <span className="shrink-0 text-[13px] text-graphite">卫</span>
            </div>
          </FormItem>
          <FormField
            control={control}
            name="floor_info"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="mb-2 block text-[14px] font-medium text-foreground tracking-tight">
                  楼层
                </FormLabel>
                <FormControl>
                  <FloorInput value={field.value || ""} onChange={field.onChange} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={control}
            name="orientation"
            render={({ field }) => (
              <FormItem className="space-y-3">
                <FormLabel className="text-[14px] font-medium text-foreground tracking-tight">
                  朝向
                </FormLabel>
                <FormControl>
                  <RadioGroup
                    onValueChange={field.onChange}
                    value={field.value}
                    className="flex flex-wrap gap-2"
                  >
                    {ORIENTATION_OPTIONS.map((option) => (
                      <label
                        key={option.value}
                        className={cn(
                          "inline-flex cursor-pointer items-center gap-2 rounded-full border px-4 py-2 text-[13px] font-medium transition-all",
                          field.value === option.value
                            ? "border-ink bg-ink text-pure-white"
                            : "border-dove/50 bg-pure-white text-graphite hover:border-dove hover:bg-fog/50",
                        )}
                      >
                        <input
                          type="radio"
                          value={option.value}
                          checked={field.value === option.value}
                          onChange={() => field.onChange(option.value)}
                          className="sr-only"
                        />
                        {option.label}
                      </label>
                    ))}
                  </RadioGroup>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={control}
            name="business_form"
            render={({ field }) => (
              <FormItem className="space-y-3">
                <FormLabel className="text-[14px] font-medium text-foreground tracking-tight">
                  业务形式
                </FormLabel>
                <FormControl>
                  <RadioGroup
                    onValueChange={field.onChange}
                    value={field.value || ""}
                    className="flex flex-wrap gap-2"
                  >
                    {BUSINESS_FORM_OPTIONS.map((option) => (
                      <label
                        key={option.value}
                        className={cn(
                          "inline-flex cursor-pointer items-center gap-2 rounded-full border px-4 py-2 text-[13px] font-medium transition-all",
                          field.value === option.value
                            ? "border-ink bg-ink text-pure-white"
                            : "border-dove/50 bg-pure-white text-graphite hover:border-dove hover:bg-fog/50",
                        )}
                      >
                        <input
                          type="radio"
                          value={option.value}
                          checked={field.value === option.value}
                          onChange={() => field.onChange(option.value)}
                          className="sr-only"
                        />
                        {option.label}
                      </label>
                    ))}
                  </RadioGroup>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={control}
            name="project_manager_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="mb-2 block text-[14px] font-medium text-foreground tracking-tight">
                  项目负责人
                </FormLabel>
                <Select
                  value={field.value || "__empty__"}
                  onValueChange={(value) => {
                    field.onChange(value === "__empty__" ? undefined : value);
                  }}
                >
                  <FormControl>
                    <SelectTrigger className="rounded-inputs h-10 border-dove/50 bg-pure-white text-[14px] focus:ring-ink/10">
                      <SelectValue placeholder={users.length === 0 ? "加载中..." : "未选择"} />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="__empty__">未选择</SelectItem>
                    {users.map((user) => (
                      <SelectItem key={user.id} value={user.id}>
                        {user.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* --- 业主信息（含公用事业户号） --- */}
        <GroupTitle>业主信息</GroupTitle>
        <div className="grid grid-cols-1 gap-x-5 gap-y-4 py-3 sm:grid-cols-3">
          <SimpleInputField control={control} name="electricity_account" label="电表户号" />
          <SimpleInputField control={control} name="water_account" label="水表户号" />
          <SimpleInputField control={control} name="gas_account" label="煤气户号" />
        </div>

        {fields.map((field, index) => (
          <div key={field.id} className="my-3 rounded-[16px] border border-[#efeff1] bg-fog/30 p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-[13px] font-medium text-graphite">业主 #{index + 1}</span>
              <button
                type="button"
                onClick={() => remove(index)}
                disabled={fields.length <= 1}
                className="inline-flex items-center gap-1 rounded-full bg-none px-2 py-1 text-[12.5px] font-[430] text-graphite transition-colors hover:text-error disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
                删除业主
              </button>
            </div>
            <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
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
              <BankCardField
                control={control}
                name={`owners.${index}.bank_card_number`}
                ownerId={project.owners?.[index]?.id}
                loadFullCard={() => loadFullCard(index)}
              />
              <SimpleInputField
                control={control}
                name={`owners.${index}.relation_type`}
                label="关系类型"
                placeholder="业主"
              />
            </div>
            <div className="mt-3">
              <SimpleTextareaField
                control={control}
                name={`owners.${index}.owner_info`}
                label="备注"
              />
            </div>
          </div>
        ))}
        <button
          type="button"
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
          className="inline-flex items-center gap-1.5 rounded-full bg-none px-0 py-1 text-[13.5px] font-[450] text-ink hover:underline hover:underline-offset-4"
        >
          <Plus className="h-4 w-4" />
          新增业主
        </button>

        {/* --- 合同要件（子组件：ContractEssentialsSection） --- */}
        <ContractEssentialsSection
          control={control}
          manualPeriod={manualPeriod}
          onManualPeriodChange={setManualPeriod}
          costAssumptionType={costAssumptionType}
        />
        {/* --- 备注 --- */}
        <GroupTitle className="mt-5">备注</GroupTitle>
        <div className="py-3">
          <SimpleTextareaField
            control={control}
            name="notes"
            label="项目备注"
            placeholder="业主沟通偏好、特别注意事项等"
          />
        </div>

        {/* 保存 / 取消 */}
        <div className="mt-4 flex items-center justify-end gap-3 border-t border-[#f0f0f2] pt-4">
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="rounded-full border border-[#e2e2e5] bg-pure-white px-[16px] py-[7px] text-[13.5px] font-[450] text-ink transition-colors hover:border-dove hover:bg-[#fafafa] disabled:cursor-not-allowed disabled:opacity-60"
          >
            取消
          </button>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-full bg-ink px-[18px] py-[7px] text-[13.5px] font-[450] text-pure-white transition-colors hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {saving ? "保存中..." : "保存"}
          </button>
        </div>
      </form>
    </Form>
  );
}
