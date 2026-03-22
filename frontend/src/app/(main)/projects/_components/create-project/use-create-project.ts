"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { createProjectAction, updateProjectAction } from "../../actions/core";
import { FormValues, ProjectCreateReq, ProjectUpdateReq } from "./schema";
import { Project } from "../../types";
import { buildLayout, toDateStr } from "./utils";
import { useDraft } from "./use-draft";
import { useFormInit, getDefaultValues, getFormResolver } from "./use-form-init";

interface UseCreateProjectProps {
  project?: Project;
  onSuccess?: () => void;
}

export const useCreateProject = ({
  project,
  onSuccess,
}: UseCreateProjectProps = {}) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("basic");

  const isEditMode = !!project;

  const form = useForm<FormValues>({
    resolver: getFormResolver(),
    defaultValues: getDefaultValues(project, isEditMode),
  });

  // 初始化表单（编辑模式）
  useFormInit({ form, project, open, isEditMode });

  // 草稿管理
  const { clearDraft } = useDraft({ form, open, isEditMode });

  const onSubmit = async (values: FormValues) => {
    setLoading(true);

    try {
      const layoutString = buildLayout(
        values.rooms,
        values.halls,
        values.bathrooms
      );

      const basePayload = {
        community_name: values.community_name || null,
        address: values.address || null,
        area: values.area ?? null,
        layout: layoutString || null,
        orientation: values.orientation || null,
        owner_name: values.owner_name || null,
        owner_phone: values.owner_phone || null,
        owner_id_card: values.owner_id_card || null,
        notes: values.notes || null,
        contract_no: values.contract_no || null,
        signing_price: values.signing_price ?? null,
        signing_date: toDateStr(values.signing_date),
        signing_period: values.signing_period ?? null,
        extension_period: values.extension_period ?? null,
        extension_rent: values.extension_rent ?? null,
        cost_assumption: values.cost_assumption || null,
        planned_handover_date: toDateStr(values.planned_handover_date),
        other_agreements: values.other_agreements || null,
        signing_materials: values.attachments?.length
          ? values.attachments.map((att) => ({
              filename: att.filename,
              url: att.url,
              category: att.category,
              fileType: att.fileType,
              size: att.size,
            }))
          : null,
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
        toast.success(isEditMode ? "项目更新成功" : "项目创建成功");
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
      console.error(error);
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
    onSubmit: form.handleSubmit(onSubmit),
    isEditMode,
  };
};
