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

// 解析户型字符串为数字（如 "2室1厅1卫" -> {rooms: 2, halls: 1, bathrooms: 1}）
function parseLayout(layout: string | undefined): { rooms?: number; halls?: number; bathrooms?: number } {
  if (!layout) return {};
  const match = layout.match(/(\d+)室(\d+)厅(\d+)卫/);
  if (!match) return {};
  return {
    rooms: parseInt(match[1], 10),
    halls: parseInt(match[2], 10),
    bathrooms: parseInt(match[3], 10),
  };
}

// 组合户型数字为字符串
function buildLayout(rooms?: number, halls?: number, bathrooms?: number): string | undefined {
  const hasRooms = rooms !== undefined && rooms > 0;
  const hasHalls = halls !== undefined && halls > 0;
  const hasBathrooms = bathrooms !== undefined && bathrooms > 0;
  
  if (!hasRooms && !hasHalls && !hasBathrooms) return undefined;
  
  return `${rooms || 0}室${halls || 0}厅${bathrooms || 0}卫`;
}

export const useCreateProject = ({ project, onSuccess }: UseCreateProjectProps = {}) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("basic");

  const isEditMode = !!project;
  
  // 解析现有项目的户型数据
  const layoutData = parseLayout(project?.layout);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema) as unknown as Resolver<FormValues>,
    defaultValues: {
      // 重构后：移除 name, manager, tags, remarks 字段
      community_name: project?.community_name || project?.communityName || "",
      address: project?.address || "",
      area: project?.area,
      
      // 户型 - 三个独立输入框
      rooms: layoutData.rooms,
      halls: layoutData.halls,
      bathrooms: layoutData.bathrooms,
      
      // 朝向 - 单选框，默认"南北"
      orientation: isEditMode 
        ? (project?.orientation as FormValues["orientation"]) || "南北"
        : "南北",
      
      owner_name: project?.owner_name || project?.ownerName || "",
      owner_phone: project?.owner_phone || project?.ownerPhone || "",
      owner_id_card: project?.owner_id_card || project?.ownerIdCard || "",
      cost_assumption: project?.cost_assumption || "",
      other_agreements: project?.other_agreements || "",
      notes: project?.notes || "",
      
      signing_price: project?.signing_price ?? project?.signingPrice,
      signing_period: project?.signing_period ?? project?.signingPeriod,
      extension_period: project?.extension_period ?? project?.extensionPeriod,
      extension_rent: project?.extension_rent ?? project?.extensionRent,
      
      signing_date: (project?.signing_date || project?.signingDate) ? new Date(project.signing_date || project.signingDate!) : undefined,
      planned_handover_date: (project?.planned_handover_date || project?.plannedHandoverDate) ? new Date(project.planned_handover_date || project.plannedHandoverDate!) : undefined,
      
      attachments: project?.signing_materials?.attachments?.map(att => ({
        ...att,
        id: Math.random().toString(36).substring(7),
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
       const editLayoutData = parseLayout(project.layout);
       form.reset({
          // 重构后：移除 name, manager, tags, remarks 字段
          community_name: project.community_name || project.communityName || "",
          address: project.address || "",
          area: project.area,
          
          // 户型 - 三个独立输入框
          rooms: editLayoutData.rooms,
          halls: editLayoutData.halls,
          bathrooms: editLayoutData.bathrooms,
          
          // 朝向 - 单选框
          orientation: (project.orientation as FormValues["orientation"]) || "南北",
          
          owner_name: project.owner_name || project.ownerName || "",
          owner_phone: project.owner_phone || project.ownerPhone || "",
          owner_id_card: project.owner_id_card || project.ownerIdCard || "",
          cost_assumption: project.cost_assumption || "",
          other_agreements: project.other_agreements || "",
          notes: project.notes || "",
          signing_price: project.signing_price ?? project.signingPrice,
          signing_period: project.signing_period ?? project.signingPeriod,
          extension_period: project.extension_period ?? project.extensionPeriod,
          extension_rent: project.extension_rent ?? project.extensionRent,
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
    form.reset({ community_name: "" });
    toast.success("草稿已清空");
  }, [form]);

  const onSubmit = async (values: FormValues) => {
    setLoading(true);

    try {
      // 组合户型数据
      const layoutString = buildLayout(values.rooms, values.halls, values.bathrooms);
      
      // 构造通用 payload - 重构后：移除 name, manager, tags, remarks 字段
      const basePayload = {
        community_name: values.community_name || null,
        address: values.address || null,
        area: values.area ?? null,
        layout: layoutString || null,
        orientation: values.orientation || null,
        signing_price: values.signing_price ?? null,
        signing_period: values.signing_period ?? null,
        extension_period: values.extension_period ?? null,
        extension_rent: values.extension_rent ?? null,
        owner_name: values.owner_name || null,
        owner_phone: values.owner_phone || null,
        owner_id_card: values.owner_id_card || null,
        cost_assumption: values.cost_assumption || null,
        other_agreements: values.other_agreements || null,
        notes: values.notes || null,
        signing_date: values.signing_date?.toISOString() || null,
        planned_handover_date: values.planned_handover_date?.toISOString() || null,
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
