"use client";

import { logger } from "@/lib/logger";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { createProjectAction, updateProjectAction } from "../../actions/core";
import { updateCommunityAction } from "../../../leads/actions/update-community";
import { FormValues, ProjectCreateReq, ProjectUpdateReq } from "./schema";
import { Project } from "../../types";
import { buildLayout, toDateStr } from "./utils";
import { useDraft } from "./use-draft";
import { useFormInit, getDefaultValues, getFormResolver } from "./use-form-init";

interface UseCreateProjectProps {
  project?: Project;
  onSuccess?: () => void;
  /** 受控模式下的open状态 */
  open?: boolean;
  /** 受控模式下的onOpenChange回调 */
  onOpenChange?: (open: boolean) => void;
}

export const useCreateProject = ({
  project,
  onSuccess,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
}: UseCreateProjectProps = {}) => {
  const [internalOpen, setInternalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("basic");

  // 支持受控和非受控模式
  const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setOpen = controlledOnOpenChange || setInternalOpen;

  const isEditMode = !!project;

  const form = useForm<FormValues>({
    resolver: getFormResolver(),
    defaultValues: getDefaultValues(project, isEditMode),
  });

  // 初始化表单（编辑模式）- 使用实际的open状态
  useFormInit({ form, project, open, isEditMode });

  // 草稿管理
  const { clearDraft, saveDraft } = useDraft({ form, open, isEditMode });

  const onSubmit = async (values: FormValues) => {
    setLoading(true);

    try {
      const layoutString = buildLayout(
        values.rooms,
        values.halls,
        values.bathrooms
      );

      const basePayload = {
        community_id: values.community_id || null,
        community_name: values.community_name,
        address: values.address,
        area: values.area ?? null,
        layout: layoutString || null,
        orientation: values.orientation || null,
        floor_info: values.floor_info || null,
        project_manager_id: values.project_manager_id || null,
        business_form:
          values.business_form === "agent" || values.business_form === "wholesale"
            ? values.business_form
            : null,
        electricity_account: values.electricity_account || null,
        water_account: values.water_account || null,
        gas_account: values.gas_account || null,
        notes: values.notes || null,
        contract_no: values.contract_no,
        signing_price: values.signing_price ?? null,
        signing_date: toDateStr(values.signing_date),
        signing_period: values.signing_period ?? null,
        extension_period: values.extension_period ?? null,
        extension_rent: values.extension_rent ?? null,
        cost_assumption_type: values.cost_assumption_type,
        cost_assumption_other: values.cost_assumption_type === "other" ? values.cost_assumption_other || null : null,
        planned_handover_date: toDateStr(values.planned_handover_date),
        commission_start_date: toDateStr(values.commission_start_date),
        commission_end_date: toDateStr(values.commission_end_date),
        other_agreements: values.other_agreements || null,
        owners: values.owners?.map((o) => ({
          id: o.id || undefined,
          owner_name: o.owner_name || null,
          owner_phone: o.owner_phone || null,
          owner_id_card: o.owner_id_card || null,
          bank_name: o.bank_name || null,
          bank_card_number: o.bank_card_number || null,
          relation_type: o.relation_type || "业主",
          owner_info: o.owner_info || null,
        })) ?? null,
        owner_info: values.notes || null,
      };

      let res;
      if (isEditMode && project) {
        const payload: ProjectUpdateReq = basePayload as ProjectUpdateReq;
        res = await updateProjectAction(project.id, payload);
      } else {
        const payload: ProjectCreateReq = basePayload as ProjectCreateReq;
        res = await createProjectAction(payload);
      }

      if (res.success) {
        // 已售项目后端会静默过滤非白名单字段，需明确提示用户
        const isSold = isEditMode && project?.status === "sold";
        if (isSold) {
          toast.warning("已售项目仅更新了允许修改的字段，其他字段未生效");
        } else {
          toast.success(isEditMode ? "项目更新成功" : "项目创建成功");
        }

        // AC-4.3: 项目保存成功后，若用户手动修改了行政区或商圈，回写到小区对应字段
        // 仅当值非空且与小区原始值不一致时才调用，失败不阻塞项目成功
        const communityId = values.community_id;
        const districtValue = values.district?.trim();
        const originalDistrict = values.original_community_district?.trim();
        const businessCircleValue = values.business_circle?.trim();
        const originalBusinessCircle = values.original_community_business_circle?.trim();

        const communityPatch: { district?: string; business_circle?: string } = {};
        if (districtValue && districtValue !== originalDistrict) {
          communityPatch.district = districtValue;
        }
        if (businessCircleValue && businessCircleValue !== originalBusinessCircle) {
          communityPatch.business_circle = businessCircleValue;
        }

        if (communityId && Object.keys(communityPatch).length > 0) {
          const communityRes = await updateCommunityAction(communityId, communityPatch);
          if (!communityRes.success) {
            toast.error("小区信息更新失败" + (communityRes.message ? `：${communityRes.message}` : ""));
          }
        }

        if (!isEditMode) {
          localStorage.removeItem("create_project_draft_v2");
          form.reset();
        }
        setOpen(false);
        setActiveTab("basic");
        onSuccess?.();
      } else {
        toast.error(res.message || (isEditMode ? "更新失败" : "创建失败"));
      }
    } catch (error) {
      toast.error("网络请求错误");
      logger.error(error);
    } finally {
      setLoading(false);
    }
  };

  return {
    form,
    open,
    setOpen,
    loading,
    activeTab,
    setActiveTab,
    clearDraft,
    saveDraft,
    onSubmit: form.handleSubmit(onSubmit, (errors) => {
      // 提取可序列化的错误摘要（JSON.stringify 会丢弃 undefined 和 DOM 元素 ref）
      const errorList: Record<string, { type?: string; message?: string }> = {};
      const rawErrors = errors as Record<string, unknown>;
      for (const key in rawErrors) {
        const err = rawErrors[key];
        if (err && typeof err === "object" && !Array.isArray(err)) {
          const fieldErr = err as { type?: string; message?: string };
          errorList[key] = { type: fieldErr.type, message: fieldErr.message };
        } else {
          errorList[key] = { message: String(err) };
        }
      }
      const errorKeys = Object.keys(errorList);
      if (errorKeys.length === 0) {
        logger.error("[CreateProject] Form validation failed but no specific field errors found");
        toast.error("表单验证失败，请检查必填字段");
      } else {
        logger.error("[CreateProject] Form validation errors:", errorList);
        const messages = errorKeys
          .map((k) => errorList[k].message)
          .filter(Boolean)
          .join("；");
        toast.error(messages || "表单验证失败，请检查必填字段");
      }
    }),
    isEditMode,
  };
};
