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

// 日期处理工具函数 - 内联避免时区问题
/** 将 Date 转为 YYYY-MM-DD 字符串 */
const toDateStr = (d: Date | undefined | null): string | null =>
  d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : null;

/** 将 YYYY-MM-DD 字符串转为 Date */
const fromDateStr = (s: string | undefined | null): Date | undefined =>
  s ? new Date(s + 'T00:00:00') : undefined;

// 解析户型字符串为数字
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
  const layoutData = parseLayout(project?.layout);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema) as unknown as Resolver<FormValues>,
    defaultValues: {
      community_name: project?.community_name || "",
      address: project?.address || "",
      area: project?.area,
      rooms: layoutData.rooms,
      halls: layoutData.halls,
      bathrooms: layoutData.bathrooms,
      orientation: isEditMode ? (project?.orientation as FormValues["orientation"]) || "南北" : "南北",
      owner_name: project?.owner_name || "",
      owner_phone: project?.owner_phone || "",
      owner_id_card: project?.owner_id_card || "",
      notes: project?.notes || "",
      contract_no: project?.contract_no || "",
      signing_price: project?.signing_price,
      signing_date: fromDateStr(project?.signing_date),
      signing_period: project?.signing_period,
      extension_period: project?.extension_period,
      extension_rent: project?.extension_rent,
      cost_assumption: project?.cost_assumption || "",
      planned_handover_date: fromDateStr(project?.planned_handover_date),
      other_agreements: project?.other_agreements || "",
      // 处理 signing_materials：后端返回的是附件对象数组
      attachments: (() => {
        const materials = project?.signing_materials;
        if (!materials) return [];
        // 如果是数组（附件对象数组）
        if (Array.isArray(materials)) {
          return materials.map((item: unknown) => {
            // 检查是字符串（旧URL格式）还是对象（新格式）
            if (typeof item === 'string') {
              // 旧格式：URL字符串
              const url = item;
              return {
                id: Math.random().toString(36).substring(7),
                filename: url.split('/').pop() || 'unknown',
                url: url,
                category: 'other' as AttachmentCategory,
                fileType: 'pdf' as AttachmentType,
                size: 0,
                uploadedAt: new Date().toISOString(),
              };
            }
            // 新格式：附件对象
            const att = item as { filename: string; url: string; category: string; fileType: string; size?: number };
            return {
              id: Math.random().toString(36).substring(7),
              filename: att.filename || 'unknown',
              url: att.url,
              category: (att.category || 'other') as AttachmentCategory,
              fileType: (att.fileType || 'pdf') as AttachmentType,
              size: att.size || 0,
              uploadedAt: new Date().toISOString(),
            };
          });
        }
        // 如果是对象（旧格式，包含 attachments 数组）
        if (typeof materials === 'object' && materials !== null && 'attachments' in materials) {
          return (materials as { attachments?: Array<{ filename: string; url: string; category: string; fileType: string; size?: number }> }).attachments?.map((att) => ({
            ...att,
            id: Math.random().toString(36).substring(7),
            uploadedAt: new Date().toISOString(),
            category: att.category as AttachmentCategory,
            fileType: att.fileType as AttachmentType,
          })) || [];
        }
        return [];
      })(),
    },
  });

  // 草稿恢复
  useEffect(() => {
    if (open && !isEditMode) {
      const draft = localStorage.getItem(DRAFT_KEY);
      if (draft) {
        try {
          const parsed = JSON.parse(draft);
          if (parsed.signing_date) parsed.signing_date = fromDateStr(parsed.signing_date);
          if (parsed.planned_handover_date) parsed.planned_handover_date = fromDateStr(parsed.planned_handover_date);
          form.reset(parsed);
          toast.info("已恢复上次未保存的草稿");
        } catch (e) {
          console.error("Draft parse error", e);
        }
      }
    }
  }, [open, form, isEditMode]);

  // 草稿保存
  useEffect(() => {
    if (!open || isEditMode) return;
    const subscription = form.watch((val) => {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(val));
    });
    return () => subscription.unsubscribe();
  }, [open, form, isEditMode]);

  // 重置表单
  useEffect(() => {
    if (open && isEditMode && project) {
       const editLayoutData = parseLayout(project.layout);
       form.reset({
          community_name: project.community_name || "",
          address: project.address || "",
          area: project.area,
          rooms: editLayoutData.rooms,
          halls: editLayoutData.halls,
          bathrooms: editLayoutData.bathrooms,
          orientation: (project.orientation as FormValues["orientation"]) || "南北",
          owner_name: project.owner_name || "",
          owner_phone: project.owner_phone || "",
          owner_id_card: project.owner_id_card || "",
          notes: project.notes || "",
          contract_no: project.contract_no || "",
          signing_price: project.signing_price,
          signing_date: fromDateStr(project.signing_date),
          signing_period: project.signing_period,
          extension_period: project.extension_period,
          extension_rent: project.extension_rent,
          cost_assumption: project.cost_assumption || "",
          planned_handover_date: fromDateStr(project.planned_handover_date),
          other_agreements: project.other_agreements || "",
          // 处理 signing_materials：后端返回的是附件对象数组
          attachments: (() => {
            const materials = project.signing_materials;
            if (!materials) return [];
            // 如果是数组（附件对象数组）
            if (Array.isArray(materials)) {
              return materials.map((item: unknown) => {
                // 检查是字符串（旧URL格式）还是对象（新格式）
                if (typeof item === 'string') {
                  // 旧格式：URL字符串
                  const url = item;
                  return {
                    id: Math.random().toString(36).substring(7),
                    filename: url.split('/').pop() || 'unknown',
                    url: url,
                    category: 'other' as AttachmentCategory,
                    fileType: 'pdf' as AttachmentType,
                    size: 0,
                    uploadedAt: new Date().toISOString(),
                  };
                }
                // 新格式：附件对象
                const att = item as { filename: string; url: string; category: string; fileType: string; size?: number };
                return {
                  id: Math.random().toString(36).substring(7),
                  filename: att.filename || 'unknown',
                  url: att.url,
                  category: (att.category || 'other') as AttachmentCategory,
                  fileType: (att.fileType || 'pdf') as AttachmentType,
                  size: att.size || 0,
                  uploadedAt: new Date().toISOString(),
                };
              });
            }
            // 如果是对象（旧格式，包含 attachments 数组）
            if (typeof materials === 'object' && materials !== null && 'attachments' in materials) {
              return (materials as { attachments?: Array<{ filename: string; url: string; category: string; fileType: string; size?: number }> }).attachments?.map((att) => ({
                ...att,
                id: Math.random().toString(36).substring(7),
                uploadedAt: new Date().toISOString(),
                category: att.category as AttachmentCategory,
                fileType: att.fileType as AttachmentType,
              })) || [];
            }
            return [];
          })(),
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
      const layoutString = buildLayout(values.rooms, values.halls, values.bathrooms);

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
        // signing_materials 后端期望的是附件对象数组
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
    isEditMode,
  };
};
