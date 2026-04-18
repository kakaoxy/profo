import { Suspense } from "react";
import { fetchClient } from "@/lib/api-server";
import { ProjectStats } from "./_components/project-stats";
import { ProjectView } from "./_components/project-view";
import { Project } from "./types";
import { CashFlowSheet } from "./[projectId]/cashflow/_components/cashflow-sheet";
import { MonitorSheet } from "./_components/monitor/monitor-sheet";
import type { paths } from "@/lib/api-types";

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

interface ApiProjectItem {
  id: unknown;
  name?: unknown;
  status?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
  community_name?: unknown;
  address?: unknown;
  area?: unknown;
  layout?: unknown;
  orientation?: unknown;
  signing_price?: unknown;
  signing_date?: unknown;
  signing_period?: unknown;
  extension_period?: unknown;
  extension_rent?: unknown;
  cost_assumption?: unknown;
  planned_handover_date?: unknown;
  other_agreements?: unknown;
  renovation_stage?: unknown;
  contract_no?: unknown;
  list_price?: unknown;
  listing_date?: unknown;
  sold_price?: unknown;
  sold_date?: unknown;
  total_income?: unknown;
  total_expense?: unknown;
  net_cash_flow?: unknown;
  roi?: unknown;
}

function isValidProjectItem(item: unknown): item is ApiProjectItem {
  return item !== null && typeof item === "object" && "id" in (item as Record<string, unknown>);
}

function toStringOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function toNumberOrUndefined(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function mapProjectResponse(item: ApiProjectItem): Project {
  return {
    id: String(item.id),
    name: toStringOrUndefined(item.name) ?? "",
    status: toStringOrUndefined(item.status) ?? "",
    created_at: toStringOrUndefined(item.created_at) ?? "",
    updated_at: toStringOrUndefined(item.updated_at) ?? "",
    community_name: toStringOrUndefined(item.community_name),
    address: toStringOrUndefined(item.address),
    area: toNumberOrUndefined(item.area),
    layout: toStringOrUndefined(item.layout),
    orientation: toStringOrUndefined(item.orientation),
    signing_price: toNumberOrUndefined(item.signing_price),
    signing_date: toStringOrUndefined(item.signing_date),
    signing_period: toNumberOrUndefined(item.signing_period),
    extension_period: toNumberOrUndefined(item.extension_period),
    extension_rent: toNumberOrUndefined(item.extension_rent),
    cost_assumption: toStringOrUndefined(item.cost_assumption),
    planned_handover_date: toStringOrUndefined(item.planned_handover_date),
    other_agreements: toStringOrUndefined(item.other_agreements),
    renovation_stage: toStringOrUndefined(item.renovation_stage),
    contract_no: toStringOrUndefined(item.contract_no),
    list_price: toNumberOrUndefined(item.list_price),
    listing_date: toStringOrUndefined(item.listing_date),
    sold_price: toNumberOrUndefined(item.sold_price),
    sold_date: toStringOrUndefined(item.sold_date),
    total_income: toNumberOrUndefined(item.total_income),
    total_expense: toNumberOrUndefined(item.total_expense),
    net_cash_flow: toNumberOrUndefined(item.net_cash_flow),
    roi: toNumberOrUndefined(item.roi),
  };
}

function isProjectListResponse(data: unknown): data is ProjectListResponse {
  return data !== null && typeof data === "object" && "items" in (data as Record<string, unknown>);
}

function isProjectStatsResponse(data: unknown): data is ProjectStatsResponse {
  return data !== null && typeof data === "object";
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

  const projectData: Project[] = isProjectListResponse(listRes.data)
    ? (listRes.data.items ?? []).filter(isValidProjectItem).map(mapProjectResponse)
    : [];
  const total = isProjectListResponse(listRes.data) ? listRes.data.total ?? 0 : 0;

  const stats = isProjectStatsResponse(statsRes.data)
    ? statsRes.data
    : { signing: 0, renovating: 0, selling: 0, sold: 0 };

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
