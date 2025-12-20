"use client";

import { useState, useEffect, useCallback } from "react";
import { useForm, Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { createProjectAction, updateProjectAction } from "../../actions/core";
import { formSchema, FormValues, DRAFT_KEY, ProjectCreateReq, ProjectUpdateReq, AttachmentCategory, AttachmentType } from "./schema";
import { Project } from "../../types";

interface UseCreateProjectProps {
  project?: Project;
  onSuccess?: () => void;
}

export const useCreateProject = ({ project, onSuccess }: UseCreateProjectProps = {}) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("basic");

  const isEditMode = !!project;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema) as unknown as Resolver<FormValues>,
    defaultValues: {
      name: project?.name || "",
      community_name: project?.community_name || project?.communityName || "",
      address: project?.address || "",
      manager: project?.manager || "",
      tags: project?.tags?.join(", ") || "",
      owner_name: project?.owner_name || project?.ownerName || "",
      owner_phone: project?.owner_phone || project?.ownerPhone || "",
      owner_id_card: project?.owner_id_card || project?.ownerIdCard || "",
      costAssumption: project?.costAssumption || project?.cost_assumption || "",
      otherAgreements: project?.otherAgreements || project?.other_agreements || "",
      notes: project?.notes || "",
      remarks: project?.remarks || "",
      
      signing_price: project?.signing_price ?? project?.signingPrice,
      area: project?.area,
      signing_period: project?.signing_period ?? project?.signingPeriod,
      extensionPeriod: project?.extensionPeriod ?? project?.extension_period,
      extensionRent: project?.extensionRent ?? project?.extension_rent,
      
      signing_date: (project?.signing_date || project?.signingDate) ? new Date(project.signing_date || project.signingDate!) : undefined,
      planned_handover_date: (project?.planned_handover_date || project?.plannedHandoverDate) ? new Date(project.planned_handover_date || project.plannedHandoverDate!) : undefined,
      
      attachments: project?.signing_materials?.attachments?.map(att => ({
        ...att,
        id: Math.random().toString(36).substring(7), // Generate temp ID if needed
        uploadedAt: new Date().toISOString(),
        category: att.category as AttachmentCategory,
        fileType: att.fileType as AttachmentType,
      })) || [],
    },
  });

  // 草稿恢复 - 仅新建模式有效
  useEffect(() => {
    if (open && !isEditMode) {
      const draft = localStorage.getItem(DRAFT_KEY);
      if (draft) {
        try {
          const parsed = JSON.parse(draft);
          if (parsed.signing_date)
            parsed.signing_date = new Date(parsed.signing_date);
          if (parsed.planned_handover_date)
            parsed.planned_handover_date = new Date(parsed.planned_handover_date);
          form.reset(parsed);
          toast.info("已恢复上次未保存的草稿");
        } catch (e) {
          console.error("Draft parse error", e);
        }
      }
    }
  }, [open, form, isEditMode]);

  // 草稿保存 - 仅新建模式有效
  useEffect(() => {
    if (!open || isEditMode) return;
    const subscription = form.watch((val) => {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(val));
    });
    return () => subscription.unsubscribe();
  }, [open, form, isEditMode]);

  // 重置表单 - 编辑模式重置为 initialData，新建模式重置为空
  useEffect(() => {
    if (open && isEditMode && project) {
       form.reset({
          name: project.name || "",
          community_name: project.community_name || project.communityName || "",
          address: project.address || "",
          manager: project.manager || "",
          tags: project.tags?.join(", ") || "",
          owner_name: project.owner_name || project.ownerName || "",
          owner_phone: project.owner_phone || project.ownerPhone || "",
          owner_id_card: project.owner_id_card || project.ownerIdCard || "",
          costAssumption: project.costAssumption || project.cost_assumption || "",
          otherAgreements: project.otherAgreements || project.other_agreements || "",
          notes: project.notes || "",
          remarks: project.remarks || "",
          signing_price: project.signing_price ?? project.signingPrice,
          area: project.area,
          signing_period: project.signing_period ?? project.signingPeriod,
          extensionPeriod: project.extensionPeriod ?? project.extension_period,
          extensionRent: project.extensionRent ?? project.extension_rent,
          signing_date: (project.signing_date || project.signingDate) ? new Date(project.signing_date || project.signingDate!) : undefined,
          planned_handover_date: (project.planned_handover_date || project.plannedHandoverDate) ? new Date(project.planned_handover_date || project.plannedHandoverDate!) : undefined,
          attachments: project.signing_materials?.attachments?.map(att => ({
            ...att,
            id: Math.random().toString(36).substring(7),
            uploadedAt: new Date().toISOString(),
            category: att.category as AttachmentCategory,
            fileType: att.fileType as AttachmentType,
          })) || [],
       });
    }
  }, [open, isEditMode, project, form]);


  const clearDraft = useCallback(() => {
    localStorage.removeItem(DRAFT_KEY);
    form.reset({ name: "" });
    toast.success("草稿已清空");
  }, [form]);

  const onSubmit = async (values: FormValues) => {
    setLoading(true);

    try {
      const tagArray = values.tags
        ? values.tags.split(/[,，]/).map((t) => t.trim()).filter(Boolean)
        : null;

      // 构造通用 payload
      const basePayload = {
        name: values.name,
        community_name: values.community_name || null,
        address: values.address || null,
        manager: values.manager || null,
        tags: tagArray,
        signing_price: values.signing_price ?? null,
        area: values.area ?? null,
        signing_period: values.signing_period ?? null,
        extensionPeriod: values.extensionPeriod ?? null,
        extensionRent: values.extensionRent ?? null,
        owner_name: values.owner_name || null,
        owner_phone: values.owner_phone || null,
        owner_id_card: values.owner_id_card || null,
        costAssumption: values.costAssumption || null,
        otherAgreements: values.otherAgreements || null,
        notes: values.notes || null,
        remarks: values.remarks || null,
        signing_date: values.signing_date?.toISOString() || null,
        planned_handover_date: values.planned_handover_date?.toISOString() || null,
        signing_materials: values.attachments?.length
          ? {
              attachments: values.attachments.map((att) => ({
                filename: att.filename,
                url: att.url,
                category: att.category,
                fileType: att.fileType,
                size: att.size,
              })),
            }
          : null,
        owner_info: null,
        // 下面四个字段在 ProjectCreate 实体中是必填的（默认值为 0）
        total_income: 0,
        total_expense: 0,
        net_cash_flow: 0,
        roi: 0,
      };

      let res;
      if (isEditMode && project) {
        // 更新模式 - ProjectUpdateReq 字段皆为可选，多传无妨
        const payload: ProjectUpdateReq = basePayload as ProjectUpdateReq;
        res = await updateProjectAction(project.id, payload);
      } else {
        // 新建模式 - 补齐必填字段后符合 ProjectCreateReq
        const payload: ProjectCreateReq = basePayload as ProjectCreateReq;
        res = await createProjectAction(payload);
      }

      if (res.success) {
        toast.success(isEditMode ? "项目更新成功" : "项目创建成功");
        if (!isEditMode) {
           localStorage.removeItem(DRAFT_KEY);
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
    isEditMode, // 导出模式标记
  };
};
