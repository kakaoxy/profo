"use client";

import { updateCommunityAction } from "../../../leads/actions/update-community";
import { FormValues, ProjectUpdateReq } from "./schema";

// 日期处理工具函数 - 内联避免时区问题
/** 将 Date 转为 YYYY-MM-DD 字符串 */
export const toDateStr = (d: Date | undefined | null): string | null =>
  d
    ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
    : null;

/** 将日期字符串转为 Date（容错：取前 10 位 YYYY-MM-DD，避免已带时间导致 Invalid Date） */
export const fromDateStr = (s: string | undefined | null): Date | undefined => {
  if (!s) return undefined;
  const datePart = s.slice(0, 10);
  const d = new Date(datePart + "T00:00:00");
  return isNaN(d.getTime()) ? undefined : d;
};

// 解析户型字符串为数字
export function parseLayout(layout: string | undefined): {
  rooms: number | undefined;
  halls: number | undefined;
  bathrooms: number | undefined;
} {
  if (!layout) return { rooms: undefined, halls: undefined, bathrooms: undefined };
  const match = layout.match(/(\d+)室(\d+)厅(\d+)卫/);
  if (!match) return { rooms: undefined, halls: undefined, bathrooms: undefined };
  return {
    rooms: parseInt(match[1], 10),
    halls: parseInt(match[2], 10),
    bathrooms: parseInt(match[3], 10),
  };
}

// 组合户型数字为字符串
export function buildLayout(
  rooms?: number,
  halls?: number,
  bathrooms?: number,
): string | undefined {
  const hasRooms = rooms !== undefined && rooms > 0;
  const hasHalls = halls !== undefined && halls > 0;
  const hasBathrooms = bathrooms !== undefined && bathrooms > 0;
  if (!hasRooms && !hasHalls && !hasBathrooms) return undefined;
  return `${rooms || 0}室${halls || 0}厅${bathrooms || 0}卫`;
}

/**
 * 表单值 → 项目更新 payload（新建/编辑共用；弹窗与就地编辑共用同一组装逻辑，避免双份漂移）。
 * 字段与后端 ProjectCreate/ProjectUpdate 语义对齐（见 schema.ts）。
 */
export function buildProjectUpdatePayload(values: FormValues): ProjectUpdateReq {
  const layoutString = buildLayout(values.rooms, values.halls, values.bathrooms);

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
    cost_assumption_other:
      values.cost_assumption_type === "other" ? values.cost_assumption_other || null : null,
    planned_handover_date: toDateStr(values.planned_handover_date),
    commission_start_date: toDateStr(values.commission_start_date),
    commission_end_date: toDateStr(values.commission_end_date),
    other_agreements: values.other_agreements || null,
    owners:
      values.owners?.map((o) => ({
        id: o.id || undefined,
        owner_name: o.owner_name || null,
        owner_phone: o.owner_phone || null,
        owner_id_card: o.owner_id_card || null,
        bank_name: o.bank_name || null,
        bank_card_number: o.bank_card_number || null,
        relation_type: o.relation_type || "业主",
        owner_info: o.owner_info || null,
      })) ?? null,
  };

  return basePayload as ProjectUpdateReq;
}

/**
 * 项目保存成功后，若用户手动修改了行政区或商圈，回写到小区对应字段。
 * 仅当值非空且与小区原始值不一致时才调用，失败不阻塞项目成功。
 */
export async function syncCommunityDistrict(
  values: FormValues,
): Promise<{ success: boolean; message?: string }> {
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
    return await updateCommunityAction(communityId, communityPatch);
  }
  return { success: true };
}
