"use server";

import { logger } from "@/lib/logger";
import { fetchClient } from "@/lib/api-server";
import { revalidatePath } from "next/cache";
import { Lead, FilterState } from "../types";
import { ActionResult, extractErrorMessage } from "@/lib/action-result";
import type { components, operations } from "@/lib/api-types";
import { mapBackendToFrontend } from "../lib/utils";

type LeadsQuery =
  operations["get_leads_api_v1_leads_get"]["parameters"]["query"];
type LeadCreatePayload =
  operations["create_lead_api_v1_leads_post"]["requestBody"]["content"]["application/json"];
type LeadUpdatePayload =
  operations["update_lead_api_v1_leads__lead_id__put"]["requestBody"]["content"]["application/json"];

function toLeadPayload(data: Partial<Lead>): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  if (data.communityName !== undefined) payload.community_name = data.communityName;
  if (data.communityId !== undefined) payload.community_id = data.communityId;
  if (data.layout !== undefined) payload.layout = data.layout;
  if (data.orientation !== undefined) payload.orientation = data.orientation;
  if (data.floorInfo !== undefined) payload.floor_info = data.floorInfo;
  if (data.area !== undefined) payload.area = data.area;
  if (data.totalPrice !== undefined) payload.total_price = data.totalPrice;
  if (data.unitPrice !== undefined) payload.unit_price = data.unitPrice;
  if (data.evalPrice !== undefined) payload.eval_price = data.evalPrice;
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
  try {
    const client = await fetchClient();

    const payload: LeadCreatePayload = {
      ...toLeadPayload(data),
      is_hot: 0,
      images: data.images || [],
    } as LeadCreatePayload;

    const { data: responseData, error } = await client.POST("/api/v1/leads", {
      body: payload,
    });

    if (error || !responseData) {
      return { success: false, error: extractErrorMessage(error) };
    }

    revalidatePath("/leads");
    return { success: true, data: mapBackendToFrontend(responseData) };
  } catch (error) {
    logger.error("Create lead error:", error);
    return { success: false, error: extractErrorMessage(error) };
  }
}

export async function getLeadsAction(filters: FilterState) {
  const client = await fetchClient();
  const query: LeadsQuery = {
    page: 1,
    page_size: 100,
  };
  if (filters.search) query.search = filters.search;

  if (filters.statuses && filters.statuses.length > 0) {
    query.statuses = filters.statuses as components["schemas"]["LeadStatus"][];
  }

  const { data, error } = await client.GET("/api/v1/leads", {
    params: { query },
  });

  if (error || !data) {
    logger.error("Get leads error:", error);
    return [];
  }

  return (data.items || []).map(mapBackendToFrontend);
}

export async function updateLeadAction(
  leadId: string,
  data: Partial<Lead>
): Promise<ActionResult<Lead>> {
  try {
    const client = await fetchClient();

    const payload: LeadUpdatePayload = toLeadPayload(data) as LeadUpdatePayload;

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

    revalidatePath("/leads");
    return { success: true, data: mapBackendToFrontend(responseData) };
  } catch (error) {
    logger.error("Update lead error:", error);
    return { success: false, error: extractErrorMessage(error) };
  }
}

export async function deleteLeadAction(
  leadId: string
): Promise<ActionResult<void>> {
  try {
    const client = await fetchClient();

    const { error } = await client.DELETE("/api/v1/leads/{lead_id}", {
      params: { path: { lead_id: leadId } },
    });

    if (error) {
      return { success: false, error: extractErrorMessage(error) };
    }

    revalidatePath("/leads");
    return { success: true, data: undefined };
  } catch (error) {
    logger.error("Delete lead error:", error);
    return { success: false, error: extractErrorMessage(error) };
  }
}
