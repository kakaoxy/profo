"use client";

import { useEffect } from "react";
import { UseFormReturn, Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { formSchema, FormValues } from "./schema";
import { Project } from "../../types";
import { parseLayout, convertAttachments } from "./utils";

interface UseFormInitProps {
  form: UseFormReturn<FormValues>;
  project?: Project;
  open: boolean;
  isEditMode: boolean;
}

/**
 * 处理表单初始化的 Hook
 * - 设置默认值
 * - 编辑模式下重置表单
 */
export function useFormInit({ form, project, open, isEditMode }: UseFormInitProps) {
  // 重置表单（编辑模式）
  useEffect(() => {
    if (open && isEditMode && project) {
      const editLayoutData = parseLayout(project.layout);
      form.reset({
        community_name: project.community_name || "",
        address: project.address || "",
        area: project.area,
        project_manager_id: project.project_manager?.id || undefined,
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
        signing_date: project.signing_date
          ? new Date(project.signing_date + "T00:00:00")
          : undefined,
        signing_period: project.signing_period,
        extension_period: project.extension_period,
        extension_rent: project.extension_rent,
        cost_assumption: project.cost_assumption || "",
        planned_handover_date: project.planned_handover_date
          ? new Date(project.planned_handover_date + "T00:00:00")
          : undefined,
        other_agreements: project.other_agreements || "",
        attachments: convertAttachments(project.signing_materials),
      });
    }
  }, [open, isEditMode, project, form]);
}

/**
 * 获取表单默认值的工厂函数
 */
export function getDefaultValues(
  project?: Project,
  isEditMode: boolean = false
): FormValues {
  const layoutData = parseLayout(project?.layout);

  return {
    community_name: project?.community_name || "",
    address: project?.address || "",
    area: project?.area,
    project_manager_id: project?.project_manager?.id || undefined,
    // 修复：户型字段无值时返回undefined，让placeholder生效
    rooms: layoutData.rooms,
    halls: layoutData.halls,
    bathrooms: layoutData.bathrooms,
    orientation: isEditMode
      ? (project?.orientation as FormValues["orientation"]) || "南北"
      : "南北",
    owner_name: project?.owner_name || "",
    owner_phone: project?.owner_phone || "",
    owner_id_card: project?.owner_id_card || "",
    notes: project?.notes || "",
    contract_no: project?.contract_no || "",
    signing_price: project?.signing_price,
    signing_date: project?.signing_date
      ? new Date(project.signing_date + "T00:00:00")
      : undefined,
    signing_period: project?.signing_period,
    extension_period: project?.extension_period,
    extension_rent: project?.extension_rent,
    cost_assumption: project?.cost_assumption || "",
    planned_handover_date: project?.planned_handover_date
      ? new Date(project.planned_handover_date + "T00:00:00")
      : undefined,
    other_agreements: project?.other_agreements || "",
    attachments: convertAttachments(project?.signing_materials),
  };
}

/**
 * 获取表单 resolver
 */
export function getFormResolver() {
  return zodResolver(formSchema) as unknown as Resolver<FormValues>;
}
