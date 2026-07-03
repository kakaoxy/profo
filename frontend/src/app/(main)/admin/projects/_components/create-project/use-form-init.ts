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
        community_id: project.community_id || undefined,
        community_name: project.community_name || "",
        address: project.address || "",
        area: project.area,
        project_manager_id: project.project_manager?.id || undefined,
        business_form:
          project.business_form === "agent" || project.business_form === "wholesale"
            ? project.business_form
            : "agent",
        district: project.district || "",
        original_community_district: project.district || "",
        business_circle: project.business_circle || "",
        original_community_business_circle: project.business_circle || "",
        rooms: editLayoutData.rooms,
        halls: editLayoutData.halls,
        bathrooms: editLayoutData.bathrooms,
        orientation: (project.orientation as FormValues["orientation"]) || "南北",
        floor_info: project.floor_info || "",
        electricity_account: project.electricity_account || undefined,
        water_account: project.water_account || undefined,
        gas_account: project.gas_account || undefined,
        owners:
          project.owners && project.owners.length > 0
            ? project.owners.map((o) => ({
                id: o.id || undefined,
                owner_name: o.owner_name || "",
                owner_phone: o.owner_phone || "",
                owner_id_card: o.owner_id_card || "",
                bank_name: o.bank_name || "",
                bank_card_number: o.bank_card_number || "",
                relation_type: o.relation_type || "业主",
                owner_info: o.owner_info || "",
              }))
            : [
                {
                  owner_name: project.owner_name || "",
                  owner_phone: project.owner_phone || "",
                  owner_id_card: project.owner_id_card || "",
                  bank_name: "",
                  bank_card_number: "",
                  relation_type: "业主",
                  owner_info: "",
                },
              ],
        notes: project.notes || "",
        contract_no: project.contract_no || "",
        signing_price: project.signing_price,
        signing_date: project.signing_date
          ? new Date(project.signing_date + "T00:00:00")
          : undefined,
        signing_period: project.signing_period,
        extension_period: project.extension_period,
        extension_rent: project.extension_rent,
        cost_assumption_type: (project.cost_assumption_type as FormValues["cost_assumption_type"]) || "respective",
        cost_assumption_other: project.cost_assumption_other || "",
        planned_handover_date: project.planned_handover_date
          ? new Date(project.planned_handover_date + "T00:00:00")
          : undefined,
        commission_start_date: project.commission_start_date
          ? new Date(project.commission_start_date + "T00:00:00")
          : undefined,
        commission_end_date: project.commission_end_date
          ? new Date(project.commission_end_date + "T00:00:00")
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
    community_id: project?.community_id || undefined,
    community_name: project?.community_name || "",
    address: project?.address || "",
    area: project?.area,
    project_manager_id: project?.project_manager?.id || undefined,
    business_form:
      project?.business_form === "agent" || project?.business_form === "wholesale"
        ? project.business_form
        : "agent",
    district: project?.district || "",
    original_community_district: project?.district || "",
    business_circle: project?.business_circle || "",
    original_community_business_circle: project?.business_circle || "",
    // 修复：户型字段无值时返回undefined，让placeholder生效
    rooms: layoutData.rooms,
    halls: layoutData.halls,
    bathrooms: layoutData.bathrooms,
    orientation: isEditMode
      ? (project?.orientation as FormValues["orientation"]) || "南北"
      : "南北",
    floor_info: project?.floor_info || "",
    electricity_account: project?.electricity_account || undefined,
    water_account: project?.water_account || undefined,
    gas_account: project?.gas_account || undefined,
    owners:
      project && project.owners && project.owners.length > 0
        ? project.owners.map((o) => ({
            id: o.id || undefined,
            owner_name: o.owner_name || "",
            owner_phone: o.owner_phone || "",
            owner_id_card: o.owner_id_card || "",
            bank_name: o.bank_name || "",
            bank_card_number: o.bank_card_number || "",
            relation_type: o.relation_type || "业主",
            owner_info: o.owner_info || "",
          }))
        : project
          ? [
              {
                owner_name: project.owner_name || "",
                owner_phone: project.owner_phone || "",
                owner_id_card: project.owner_id_card || "",
                bank_name: "",
                bank_card_number: "",
                relation_type: "业主",
                owner_info: "",
              },
            ]
          : [
              {
                owner_name: "",
                owner_phone: "",
                owner_id_card: "",
                bank_name: "",
                bank_card_number: "",
                relation_type: "业主",
                owner_info: "",
              },
            ],
    notes: project?.notes || "",
    contract_no: project?.contract_no || "",
    signing_price: project?.signing_price,
    signing_date: project?.signing_date
      ? new Date(project.signing_date + "T00:00:00")
      : undefined,
    signing_period: project?.signing_period,
    extension_period: project?.extension_period,
    extension_rent: project?.extension_rent,
    cost_assumption_type: (project?.cost_assumption_type as FormValues["cost_assumption_type"]) || "respective",
    cost_assumption_other: project?.cost_assumption_other || "",
    planned_handover_date: project?.planned_handover_date
      ? new Date(project.planned_handover_date + "T00:00:00")
      : undefined,
    commission_start_date: project?.commission_start_date
      ? new Date(project.commission_start_date + "T00:00:00")
      : undefined,
    commission_end_date: project?.commission_end_date
      ? new Date(project.commission_end_date + "T00:00:00")
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
