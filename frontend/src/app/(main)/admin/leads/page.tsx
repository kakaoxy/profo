import { fetchClient } from "@/lib/api-server";
import { LeadsView } from "./_components/leads-view";
import type { Lead } from "./types";
import type { components, operations } from "@/lib/api-types";
import { mapBackendToFrontend } from "./lib/utils";

interface PageProps {
  searchParams: Promise<{
    search?: string;
    statuses?: string;
    district?: string;
    leadId?: string;
    page?: string;
    page_size?: string;
  }>;
}

type LeadsQuery =
  operations["get_leads_api_v1_leads_get"]["parameters"]["query"];
type LeadStatsResponse = components["schemas"]["LeadStatsResponse"];

const DEFAULT_PAGE_SIZE = 20;

export default async function LeadsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const client = await fetchClient();

  const page = Number(params.page) || 1;
  const page_size = Number(params.page_size) || DEFAULT_PAGE_SIZE;

  // Build query parameters
  const queryParams: LeadsQuery = {
    page,
    page_size,
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

  // 并行获取线索列表和状态统计（统计不受分页影响）
  const [listRes, statsRes] = await Promise.all([
    client.GET("/api/v1/leads", {
      params: { query: queryParams },
    }),
    client.GET("/api/v1/leads/stats", {}),
  ]);

  const leads: Lead[] = (listRes.data?.items || []).map(mapBackendToFrontend);
  const total = listRes.data?.total ?? 0;
  const stats: LeadStatsResponse =
    (statsRes.data as LeadStatsResponse | null) ?? {
      pending_assessment: 0,
      pending_visit: 0,
      visited: 0,
      signed: 0,
      rejected: 0,
    };

  return (
    <div className="min-h-screen bg-background">
      <LeadsView
        initialLeads={leads}
        total={total}
        stats={stats}
        initialSelectedLeadId={params.leadId}
      />
    </div>
  );
}
