import { Suspense } from "react";
import { fetchClient } from "@/lib/api-server";
import { ProjectStats } from "./_components/project-stats";
import { ProjectView } from "./_components/project-view";
import { Project } from "./types";
import { CashFlowSheet } from "./[projectId]/cashflow/_components/cashflow-sheet";
import { MonitorSheet } from "./_components/monitor/monitor-sheet";
import type { paths, components } from "@/lib/api-types";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{
    status?: string;
    page?: string;
    community_name?: string;
    cashflow_id?: string;
  }>;
}

type QueryParams = NonNullable<
  paths["/api/v1/projects"]["get"]["parameters"]["query"]
>;

type ProjectListResponse =
  paths["/api/v1/projects"]["get"]["responses"][200]["content"]["application/json"];

type ProjectStatsResponse =
  paths["/api/v1/projects/stats"]["get"]["responses"][200]["content"]["application/json"];

type ApiProjectItem = components["schemas"]["ProjectResponse"];

function mapProjectResponse(item: ApiProjectItem): Project {
  return {
    id: item.id,
    name: item.name ?? "",
    status: item.status,
    created_at: item.created_at,
    updated_at: item.updated_at,
    community_name: item.community_name ?? undefined,
    address: item.address ?? undefined,
    area: item.area ? Number(item.area) : undefined,
    layout: item.layout ?? undefined,
    orientation: item.orientation ?? undefined,
    signing_price: item.signing_price ? Number(item.signing_price) : undefined,
    signing_date: item.signing_date ?? undefined,
    signing_period: item.signing_period ?? undefined,
    extension_period: item.extension_period ?? undefined,
    extension_rent: item.extension_rent ? Number(item.extension_rent) : undefined,
    cost_assumption: item.cost_assumption ?? undefined,
    planned_handover_date: item.planned_handover_date ?? undefined,
    other_agreements: item.other_agreements ?? undefined,
    renovation_stage: item.renovation_stage ?? undefined,
    contract_no: item.contract_no ?? undefined,
    list_price: item.list_price ? Number(item.list_price) : undefined,
    listing_date: item.listing_date ?? undefined,
    sold_price: item.sold_price ? Number(item.sold_price) : undefined,
    sold_date: item.sold_date ?? undefined,
  };
}

export default async function ProjectsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const page = Number(params.page) || 1;

  const queryParams: QueryParams = {
    page: page,
    page_size: 20,
  };

  if (params.status && params.status !== "all") {
    queryParams.status = params.status;
  }

  if (params.community_name && params.community_name.trim() !== "") {
    queryParams.community_name = params.community_name.trim();
  }

  const client = await fetchClient();

  const [statsRes, listRes] = await Promise.all([
    client.GET("/api/v1/projects/stats", {}),
    client.GET("/api/v1/projects", {
      params: { query: queryParams },
    }),
  ]);

  const listData = listRes.data as ProjectListResponse | null;
  const projectData: Project[] = listData?.items?.map(mapProjectResponse) ?? [];
  const total = listData?.total ?? 0;

  const stats = (statsRes.data as ProjectStatsResponse | null) ?? { signing: 0, renovating: 0, selling: 0, sold: 0 };

  return (
    <div className="min-h-screen bg-slate-50/50">
      <div className="w-full max-w-[1600px] mx-auto flex flex-col gap-8 py-8 px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            项目管理
          </h1>
          <p className="text-sm text-slate-500">
            全生命周期管理您的房源资产，从签约到售出的每一分钱。
          </p>
        </div>

        <ProjectStats stats={stats} />

        <ProjectView data={projectData} total={total} />

        <Suspense fallback={null}>
          <CashFlowSheet />
          <MonitorSheet />
        </Suspense>
      </div>
    </div>
  );
}
