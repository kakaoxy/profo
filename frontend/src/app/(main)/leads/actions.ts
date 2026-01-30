"use server";

import { fetchClient } from "@/lib/api-server";
import { Lead, FilterState, LeadStatus, FollowUpMethod } from "./types";
import { revalidatePath } from "next/cache";
import { components, operations } from "@/lib/api-types";
import { getMarketSentimentByCommunityAction as getProjectMarketSentimentByCommunityAction } from "../projects/actions/monitor-lib/sentiment";

type BackendLead = components["schemas"]["LeadResponse"];
type LeadsQuery =
  operations["get_leads_api_v1_leads__get"]["parameters"]["query"];
type LeadCreatePayload =
  operations["create_lead_api_v1_leads__post"]["requestBody"]["content"]["application/json"];
type LeadUpdatePayload =
  operations["update_lead_api_v1_leads__lead_id__put"]["requestBody"]["content"]["application/json"];

export async function createLeadAction(data: Omit<Lead, "id" | "createdAt">) {
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
    status: data.status, // Pass initial status if set
  };

  const { data: responseData, error } = await client.POST("/api/v1/leads/", {
    body: payload,
  });

  if (error || !responseData) {
    console.error("Create lead error:", error);
    const errorMessage =
      typeof error === "object"
        ? JSON.stringify(error)
        : error || "Failed to create lead";
    throw new Error(errorMessage);
  }

  revalidatePath("/leads");
  return mapBackendToFrontend(responseData);
}

export async function getLeadsAction(filters: FilterState) {
  const client = await fetchClient();
  // Construct query params
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

export async function updateLeadAction(leadId: string, data: Partial<Lead>) {
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
  if (data.auditReason !== undefined) payload.audit_reason = data.auditReason;

  const { data: responseData, error } = await client.PUT(
    "/api/v1/leads/{lead_id}",
    {
      params: { path: { lead_id: leadId } },
      body: payload,
    },
  );

  if (error || !responseData) {
    console.error("Update lead error:", error);
    const errorMessage =
      typeof error === "object"
        ? JSON.stringify(error)
        : error || "Failed to update lead";
    throw new Error(errorMessage);
  }

  revalidatePath("/leads");
  return mapBackendToFrontend(responseData);
}

export async function deleteLeadAction(leadId: string) {
  const client = await fetchClient();

  const { error } = await client.DELETE("/api/v1/leads/{lead_id}", {
    params: { path: { lead_id: leadId } },
  });

  if (error) {
    console.error("Delete lead error:", error);
    const errorMessage =
      typeof error === "object"
        ? JSON.stringify(error)
        : error || "Failed to delete lead";
    throw new Error(errorMessage);
  }

  revalidatePath("/leads");
  return { success: true };
}

export async function addFollowUpAction(
  leadId: string,
  method: FollowUpMethod,
  content: string,
) {
  const client = await fetchClient();

  const payload = {
    method,
    content,
  };

  const { error } = await client.POST("/api/v1/leads/{lead_id}/follow-ups", {
    params: { path: { lead_id: leadId } },
    body: payload,
  });

  if (error) {
    console.error("Add follow-up error:", error);
    const errorMessage =
      typeof error === "object"
        ? JSON.stringify(error)
        : error || "Failed to add follow-up";
    throw new Error(errorMessage);
  }

  revalidatePath("/leads");
  return { success: true };
}

export async function getLeadFollowUpsAction(
  leadId: string,
): Promise<import("./types").FollowUp[]> {
  const client = await fetchClient();
  const { data, error } = await client.GET(
    "/api/v1/leads/{lead_id}/follow-ups",
    {
      params: { path: { lead_id: leadId } },
    },
  );

  if (error || !data) {
    console.error("Get follow-ups error:", error);
    return [];
  }

  return data.map((f) => ({
    id: f.id,
    leadId: f.lead_id,
    method: f.method,
    content: f.content,
    followUpTime: new Date(f.followed_at).toLocaleString(),
    createdBy: f.created_by_name || "Unknown", // Use name if available
  }));
}

export async function getLeadPriceHistoryAction(
  leadId: string,
): Promise<import("./types").PriceHistory[]> {
  const client = await fetchClient();
  const { data, error } = await client.GET("/api/v1/leads/{lead_id}/prices", {
    params: { path: { lead_id: leadId } },
  });

  if (error || !data) {
    console.error("Get price history error:", error);
    return [];
  }

  return data.map((p) => ({
    id: p.id,
    leadId: p.lead_id,
    price: p.price,
    remark: p.remark ?? undefined,
    recordedAt: new Date(p.recorded_at).toLocaleString(),
    createdByName: p.created_by_name ?? undefined,
  }));
}

export async function searchCommunitiesAction(query: string) {
  const client = await fetchClient();
  const { data, error } = await client.GET(
    "/api/v1/properties/communities/search",
    {
      params: { query: { q: query } },
    },
  );

  if (error || !data) {
    console.error("Search communities error:", error);
    return [];
  }

  return data as {
    id: number;
    name: string;
    district: string;
    business_circle: string;
  }[];
}

// --- Market Sentiment Types ---
export interface FloorStats {
  type: string;
  deals_count: number;
  deal_avg_price: number;
  current_count: number;
  current_avg_price: number;
}

export interface MarketSentiment {
  floor_stats: FloorStats[];
  inventory_months: number;
  // 计算后的汇总数据
  totalListingCount: number;
  totalDealsCount: number;
}

/**
 * 获取市场情绪数据
 * 根据小区名称查找 community_id，然后调用 monitor API
 */
export async function getMarketSentimentAction(
  communityName: string,
): Promise<MarketSentiment | null> {
  const result =
    await getProjectMarketSentimentByCommunityAction(communityName);
  if (!result.success || !result.data) return null;

  const floorStats = result.data.floor_stats || [];
  const totalListingCount = floorStats.reduce(
    (sum, s) => sum + (s.current_count || 0),
    0,
  );
  const totalDealsCount = floorStats.reduce(
    (sum, s) => sum + (s.deals_count || 0),
    0,
  );

  return {
    floor_stats: floorStats,
    inventory_months: result.data.inventory_months || 0,
    totalListingCount,
    totalDealsCount,
  };
}

function mapBackendToFrontend(backendLead: BackendLead): Lead {
  return {
    id: backendLead.id,
    communityName: backendLead.community_name,
    layout: backendLead.layout ?? "",
    orientation: backendLead.orientation ?? "",
    floorInfo: backendLead.floor_info ?? "",
    area: backendLead.area ?? 0,
    totalPrice: backendLead.total_price ?? 0,
    unitPrice: backendLead.unit_price ?? 0,
    status: backendLead.status as LeadStatus,
    evalPrice: backendLead.eval_price ?? undefined,
    auditReason: backendLead.audit_reason ?? undefined,
    auditorId: backendLead.auditor_id?.toString() ?? undefined,
    auditTime: backendLead.audit_time ?? undefined,
    images: backendLead.images || [],
    district: backendLead.district ?? "",
    businessArea: backendLead.business_area ?? "",
    remarks: backendLead.remarks ?? "",
    creatorName: backendLead.creator_name ?? "未知",
    lastFollowUpAt: backendLead.last_follow_up_at ?? undefined,
    createdAt: new Date(backendLead.created_at).toLocaleString(),
  };
}
