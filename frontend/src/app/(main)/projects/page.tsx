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

/**
 * 将 API 返回的项目数据映射为前端 Project 类型
 */
function mapProjectResponse(item: Record<string, unknown>): Project {
  return {
    id: String(item.id),
    name: String(item.name ?? ""),
    status: String(item.status),
    created_at: String(item.created_at),
    updated_at: String(item.updated_at),
    community_name: item.community_name ? String(item.community_name) : undefined,
    address: item.address ? String(item.address) : undefined,
    area: item.area ? Number(item.area) : undefined,
    layout: item.layout ? String(item.layout) : undefined,
    orientation: item.orientation ? String(item.orientation) : undefined,
    signing_price: item.signing_price ? Number(item.signing_price) : undefined,
    signing_date: item.signing_date ? String(item.signing_date) : undefined,
    signing_period: item.signing_period ? Number(item.signing_period) : undefined,
    extension_period: item.extension_period ? Number(item.extension_period) : undefined,
    extension_rent: item.extension_rent ? Number(item.extension_rent) : undefined,
    cost_assumption: item.cost_assumption ? String(item.cost_assumption) : undefined,
    planned_handover_date: item.planned_handover_date ? String(item.planned_handover_date) : undefined,
    other_agreements: item.other_agreements ? String(item.other_agreements) : undefined,
    renovation_stage: item.renovation_stage ? String(item.renovation_stage) : undefined,
    contract_no: item.contract_no ? String(item.contract_no) : undefined,
    list_price: item.list_price ? Number(item.list_price) : undefined,
    listing_date: item.listing_date ? String(item.listing_date) : undefined,
    sold_price: item.sold_price ? Number(item.sold_price) : undefined,
    sold_date: item.sold_date ? String(item.sold_date) : undefined,
    total_income: item.total_income ? Number(item.total_income) : undefined,
    total_expense: item.total_expense ? Number(item.total_expense) : undefined,
    net_cash_flow: item.net_cash_flow ? Number(item.net_cash_flow) : undefined,
    roi: item.roi ? Number(item.roi) : undefined,
  } as Project;
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

  // 使用类型安全的数据提取
  const listData = listRes.data as ProjectListResponse | undefined;
  const projectData: Project[] = (listData?.items ?? []).map(mapProjectResponse);
  const total = listData?.total ?? 0;

  const statsData = statsRes.data as ProjectStatsResponse | undefined;
  const stats = statsData ?? {
    signing: 0,
    renovating: 0,
    selling: 0,
    sold: 0,
  };

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
