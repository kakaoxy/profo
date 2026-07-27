"use server";

import { logger } from "@/lib/logger";
import { fetchClient } from "@/lib/api-server";
import { revalidatePath } from "next/cache";
import { Lead } from "../types";
import { ActionResult, extractErrorMessage } from "@/lib/action-result";
import type { operations } from "@/lib/api-types";
import { mapBackendToFrontend } from "../lib/utils";
import {
  createLeadSchema,
  updateLeadSchema,
  leadIdSchema,
} from "../_components/lead-schema";
import { PERMISSION_CODES } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/server/require-permission";

type LeadCreatePayload =
  operations["create_lead_api_v1_leads_post"]["requestBody"]["content"]["application/json"];
type LeadUpdatePayload =
  operations["update_lead_api_v1_leads__lead_id__put"]["requestBody"]["content"]["application/json"];

// 构造创建线索 payload（类型严格，无 as 强转）
// LeadCreatePayload 必填 community_name / is_hot / status，其余可选
function toCreatePayload(data: Omit<Lead, "id" | "createdAt">): LeadCreatePayload {
  const payload: LeadCreatePayload = {
    community_name: data.communityName,
    is_hot: 0,
    status: data.status,
    images: data.images || [],
  };
  if (data.communityId !== undefined) payload.community_id = data.communityId;
  if (data.layout !== undefined) payload.layout = data.layout;
  if (data.orientation !== undefined) payload.orientation = data.orientation;
  if (data.floorInfo !== undefined) payload.floor_info = data.floorInfo;
  if (data.area !== undefined) payload.area = data.area;
  if (data.totalPrice !== undefined) payload.total_price = data.totalPrice;
  if (data.unitPrice !== undefined) payload.unit_price = data.unitPrice;
  if (data.district !== undefined) payload.district = data.district;
  if (data.businessArea !== undefined) payload.business_area = data.businessArea;
  if (data.remarks !== undefined) payload.remarks = data.remarks;
  return payload;
}

// 构造更新线索 payload（类型严格，无 as 强转）
// LeadUpdatePayload 所有字段均可选，包含 audit_reason（LeadCreate 无此字段）
function toUpdatePayload(data: Partial<Lead>): LeadUpdatePayload {
  const payload: LeadUpdatePayload = {};
  if (data.communityName !== undefined) payload.community_name = data.communityName;
  if (data.communityId !== undefined) payload.community_id = data.communityId;
  if (data.layout !== undefined) payload.layout = data.layout;
  if (data.orientation !== undefined) payload.orientation = data.orientation;
  if (data.floorInfo !== undefined) payload.floor_info = data.floorInfo;
  if (data.area !== undefined) payload.area = data.area;
  if (data.totalPrice !== undefined) payload.total_price = data.totalPrice;
  if (data.unitPrice !== undefined) payload.unit_price = data.unitPrice;
  if (data.district !== undefined) payload.district = data.district;
  if (data.businessArea !== undefined) payload.business_area = data.businessArea;
  if (data.remarks !== undefined) payload.remarks = data.remarks;
  if (data.images !== undefined) payload.images = data.images;
  if (data.status !== undefined) payload.status = data.status;
  if (data.auditReason !== undefined) payload.audit_reason = data.auditReason;
  return payload;
}

export async function createLeadAction(
  data: Omit<Lead, "id" | "createdAt">
): Promise<ActionResult<Lead>> {
  const parsed = createLeadSchema.safeParse(data);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "线索参数不合法",
    };
  }

  const permCheck = await requirePermission(PERMISSION_CODES.LEAD_WRITE);
  if (!permCheck.ok) {
    return { success: false, error: permCheck.message };
  }

  try {
    const client = await fetchClient();

    const payload: LeadCreatePayload = toCreatePayload(data);

    const { data: responseData, error } = await client.POST("/api/v1/leads", {
      body: payload,
    });

    if (error || !responseData) {
      return { success: false, error: extractErrorMessage(error) };
    }

    revalidatePath("/admin/leads");
    return { success: true, data: mapBackendToFrontend(responseData) };
  } catch (error) {
    logger.error("Create lead error:", error);
    return { success: false, error: extractErrorMessage(error) };
  }
}

export async function updateLeadAction(
  leadId: string,
  data: Partial<Lead>
): Promise<ActionResult<Lead>> {
  const idParsed = leadIdSchema.safeParse(leadId);
  if (!idParsed.success) {
    return {
      success: false,
      error: idParsed.error.issues[0]?.message ?? "线索参数不合法",
    };
  }

  const parsed = updateLeadSchema.safeParse(data);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "线索参数不合法",
    };
  }

  const permCheck = await requirePermission(PERMISSION_CODES.LEAD_WRITE);
  if (!permCheck.ok) {
    return { success: false, error: permCheck.message };
  }

  try {
    const client = await fetchClient();

    const payload: LeadUpdatePayload = toUpdatePayload(data);

    const { data: responseData, error } = await client.PUT(
      "/api/v1/leads/{lead_id}",
      {
        params: { path: { lead_id: leadId } },
        body: payload,
      }
    );

    if (error || !responseData) {
      return { success: false, error: extractErrorMessage(error) };
    }

    revalidatePath("/admin/leads");
    return { success: true, data: mapBackendToFrontend(responseData) };
  } catch (error) {
    logger.error("Update lead error:", error);
    return { success: false, error: extractErrorMessage(error) };
  }
}

export async function deleteLeadAction(
  leadId: string
): Promise<ActionResult<void>> {
  const idParsed = leadIdSchema.safeParse(leadId);
  if (!idParsed.success) {
    return {
      success: false,
      error: idParsed.error.issues[0]?.message ?? "线索参数不合法",
    };
  }

  const permCheck = await requirePermission(PERMISSION_CODES.LEAD_WRITE);
  if (!permCheck.ok) {
    return { success: false, error: permCheck.message };
  }

  try {
    const client = await fetchClient();

    const { error } = await client.DELETE("/api/v1/leads/{lead_id}", {
      params: { path: { lead_id: leadId } },
    });

    if (error) {
      return { success: false, error: extractErrorMessage(error) };
    }

    revalidatePath("/admin/leads");
    return { success: true, data: undefined };
  } catch (error) {
    logger.error("Delete lead error:", error);
    return { success: false, error: extractErrorMessage(error) };
  }
}
