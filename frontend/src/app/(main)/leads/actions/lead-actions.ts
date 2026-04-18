"use server";

import { fetchClient } from "@/lib/api-server";
import { revalidatePath } from "next/cache";
import { Lead, FilterState } from "../types";
import { ActionResult, extractErrorMessage } from "@/lib/action-result";
import type { components, operations } from "@/lib/api-types";
import { mapBackendToFrontend } from "../lib/utils";

type LeadsQuery =
  operations["get_leads_api_v1_leads__get"]["parameters"]["query"];
type LeadCreatePayload =
  operations["create_lead_api_v1_leads__post"]["requestBody"]["content"]["application/json"];
type LeadUpdatePayload =
  operations["update_lead_api_v1_leads__lead_id__put"]["requestBody"]["content"]["application/json"];

export async function createLeadAction(
  data: Omit<Lead, "id" | "createdAt">
): Promise<ActionResult<Lead>> {
  try {
    const client = await fetchClient();

    const payload: LeadCreatePayload = {
      community_name: data.communityName,
      is_hot: 0,
      layout: data.layout,
      orientation: data.orientation,
      floor_info: data.floorInfo,
      area: data.area,
      total_price: data.totalPrice,
      unit_price: data.unitPrice,
      eval_price: data.evalPrice,
      district: data.district,
      business_area: data.businessArea,
      remarks: data.remarks,
      images: data.images || [],
      status: data.status,
    };

    const { data: responseData, error } = await client.POST("/api/v1/leads/", {
      body: payload,
    });

    if (error || !responseData) {
      return { success: false, error: extractErrorMessage(error) };
    }

    revalidatePath("/leads");
    return { success: true, data: mapBackendToFrontend(responseData) };
  } catch (error) {
    console.error("Create lead error:", error);
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

  const { data, error } = await client.GET("/api/v1/leads/", {
    params: { query },
  });

  if (error || !data) {
    console.error("Get leads error:", error);
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

    const payload: LeadUpdatePayload = {};
    if (data.communityName !== undefined)
      payload.community_name = data.communityName;
    if (data.layout !== undefined) payload.layout = data.layout;
    if (data.orientation !== undefined) payload.orientation = data.orientation;
    if (data.floorInfo !== undefined) payload.floor_info = data.floorInfo;
    if (data.area !== undefined) payload.area = data.area;
    if (data.totalPrice !== undefined) payload.total_price = data.totalPrice;
    if (data.unitPrice !== undefined) payload.unit_price = data.unitPrice;
    if (data.evalPrice !== undefined) payload.eval_price = data.evalPrice;
    if (data.district !== undefined) payload.district = data.district;
    if (data.businessArea !== undefined)
      payload.business_area = data.businessArea;
    if (data.remarks !== undefined) payload.remarks = data.remarks;
    if (data.images !== undefined) payload.images = data.images;
    if (data.status !== undefined)
      payload.status = data.status as components["schemas"]["LeadStatus"];
    if (data.auditReason !== undefined)
      payload.audit_reason = data.auditReason;

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
    console.error("Update lead error:", error);
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
    console.error("Delete lead error:", error);
    return { success: false, error: extractErrorMessage(error) };
  }
}
