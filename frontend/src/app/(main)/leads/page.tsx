import { fetchClient } from "@/lib/api-server";
import { LeadsView } from "./_components/leads-view";
import type { Lead, LeadStatus } from "./types";
import type { operations } from "@/lib/api-types";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{
    search?: string;
    statuses?: string;
    district?: string;
    leadId?: string; // 用于从其他页面跳转时自动打开详情抽屉
  }>;
}

// Map backend response to frontend Lead type
type LeadsQuery =
  operations["get_leads_api_v1_leads__get"]["parameters"]["query"];

function mapBackendToFrontend(backendLead: {
  id: string;
  community_name: string;
  layout?: string | null;
  orientation?: string | null;
  floor_info?: string | null;
  area?: number | null;
  total_price?: number | null;
  unit_price?: number | null;
  eval_price?: number | null;
  status: string;
  audit_reason?: string | null;
  auditor_id?: string | null;
  audit_time?: string | null;
  images?: string[];
  district?: string | null;
  business_area?: string | null;
  remarks?: string | null;
  creator_name?: string | null;
  last_follow_up_at?: string | null;
  created_at: string;
}): Lead {
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

export default async function LeadsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const client = await fetchClient();

  // Build query parameters
  const queryParams: LeadsQuery = {
    page: 1,
    page_size: 100,
  };

  if (params.search) {
    queryParams.search = params.search;
  }

  if (params.statuses) {
    queryParams.statuses = params.statuses.split(
      ",",
    ) as NonNullable<LeadsQuery>["statuses"];
  }

  if (params.district) {
    queryParams.district = params.district;
  }

  // Fetch leads data on the server
  const { data, error } = await client.GET("/api/v1/leads/", {
    params: { query: queryParams },
  });

  if (error) {
    console.error("Failed to fetch leads:", error);
  }

  const leads: Lead[] = (data?.items || []).map(mapBackendToFrontend);

  return (
    <div className="flex min-h-screen w-full flex-col bg-slate-50/50">
      <LeadsView initialLeads={leads} initialSelectedLeadId={params.leadId} />
    </div>
  );
}
