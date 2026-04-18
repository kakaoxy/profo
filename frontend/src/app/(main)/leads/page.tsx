import { fetchClient } from "@/lib/api-server";
import { LeadsView } from "./_components/leads-view";
import type { Lead } from "./types";
import type { operations } from "@/lib/api-types";
import { mapBackendToFrontend } from "./lib/utils";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{
    search?: string;
    statuses?: string;
    district?: string;
    leadId?: string;
  }>;
}

// Map backend response to frontend Lead type
type LeadsQuery =
  operations["get_leads_api_v1_leads__get"]["parameters"]["query"];

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

  const leads: Lead[] = (data?.items || []).map(mapBackendToFrontend);

  return (
    <div className="min-h-screen bg-slate-50/50">
      <LeadsView initialLeads={leads} initialSelectedLeadId={params.leadId} />
    </div>
  );
}
