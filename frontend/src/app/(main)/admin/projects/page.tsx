import { Suspense } from "react";
import { fetchClient } from "@/lib/api-server";
import { isRedirectError } from "@/lib/auth/server/session";
import { logger } from "@/lib/logger";
import { ProjectStats } from "./_components/project-stats";
import { ProjectView } from "./_components/project-view";
import { ProjectPagination } from "./_components/project-pagination";
import { Project } from "./types";
import { MonitorSheet } from "./_components/monitor/monitor-sheet";
import type { paths, components } from "@/lib/api-types";
import { toNumber } from "@/lib/number-utils";

interface PageProps {
  searchParams: Promise<{
    status?: string;
    page?: string;
    page_size?: string;
    community_name?: string;
    business_form?: string;
  }>;
}

type QueryParams = NonNullable<paths["/api/v1/projects"]["get"]["parameters"]["query"]>;

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
    area: toNumber(item.area),
    layout: item.layout ?? undefined,
    orientation: item.orientation ?? undefined,
    business_form: (item.business_form ?? null) as Project["business_form"],
    signing_price: toNumber(item.signing_price),
    signing_date: item.signing_date ?? undefined,
    signing_period: item.signing_period ?? undefined,
    extension_period: item.extension_period ?? undefined,
    extension_rent: toNumber(item.extension_rent),
    cost_assumption_type: item.cost_assumption_type ?? undefined,
    cost_assumption_other: item.cost_assumption_other ?? undefined,
    planned_handover_date: item.planned_handover_date ?? undefined,
    other_agreements: item.other_agreements ?? undefined,
    renovation_stage: item.renovation_stage ?? undefined,
    contract_no: item.contract_no ?? undefined,
    list_price: toNumber(item.list_price),
    listing_date: item.listing_date ?? undefined,
    sold_price: toNumber(item.sold_price),
    sold_date: item.sold_date ?? undefined,
    commission_start_date: item.commission_start_date ?? undefined,
    commission_end_date: item.commission_end_date ?? undefined,
    days_on_market: item.days_on_market ?? undefined,
    total_income: toNumber(item.total_income),
    total_expense: toNumber(item.total_expense),
    net_cash_flow: toNumber(item.net_cash_flow),
    roi: item.roi ?? undefined,
    project_manager: item.project_manager
      ? {
          id: item.project_manager.id,
          nickname: item.project_manager.nickname ?? undefined,
          username: item.project_manager.username ?? undefined,
          avatar: item.project_manager.avatar ?? undefined,
        }
      : undefined,
    // 销售团队角色ID
    channel_manager_id: item.channel_manager_id ?? undefined,
    property_agent_id: item.property_agent_id ?? undefined,
    negotiator_id: item.negotiator_id ?? undefined,
    // 保留 signing_materials,避免 useProjectDetail 的 useEffect([initialProject])
    // 在父组件重渲染时用缺失该字段的 initialProject 覆盖 refresh 拉取的完整数据
    signing_materials: item.signing_materials ?? undefined,
  };
}

export default async function ProjectsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const page = Number(params.page) || 1;
  const page_size = Number(params.page_size) || 20;

  const queryParams: QueryParams = {
    page: page,
    page_size: page_size,
    contract_sort: true,
  };

  if (params.status && params.status !== "all") {
    queryParams.status = params.status as NonNullable<QueryParams>["status"];
  }

  if (params.community_name && params.community_name.trim() !== "") {
    queryParams.community_name = params.community_name.trim();
  }

  if (
    params.business_form &&
    (params.business_form === "agent" || params.business_form === "wholesale")
  ) {
    queryParams.business_form = params.business_form;
  }

  const client = await fetchClient();

  let listData: ProjectListResponse | null = null;
  let statsData: ProjectStatsResponse | null = null;
  try {
    const [statsRes, listRes] = await Promise.all([
      client.GET("/api/v1/projects/stats", {}),
      client.GET("/api/v1/projects", {
        params: { query: queryParams },
      }),
    ]);
    listData = (listRes.data as ProjectListResponse | null) ?? null;
    statsData = (statsRes.data as ProjectStatsResponse | null) ?? null;
  } catch (e) {
    // 401 场景 fetchClient 会抛 NEXT_REDIRECT 交由 Next.js 渲染层执行刷新重定向，
    // 必须放行（与 layout.tsx / dashboard-data.ts 的处理一致）。
    if (isRedirectError(e)) throw e;
    // 其余异常（后端瞬时不可用/连接中断，如生产后端进程重启掐断在途连接）降级渲染，
    // 避免整页 RSC 渲染失败在浏览器端呈现 Minified React error #441。
    logger.error("项目管理列表数据获取失败", e);
    return (
      <div className="min-h-screen bg-fog">
        <div className="w-full max-w-400 mx-auto flex flex-col gap-8 py-8 px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-1">
            <h1 className="font-display text-3xl text-ink">项目管理</h1>
            <p className="text-sm text-ash">
              全生命周期管理您的房源资产，从签约到售出的每一分钱。
            </p>
          </div>
          <div className="bg-white rounded-cards p-10 shadow-steep text-center">
            <p className="text-sm text-ash">
              数据加载失败，请刷新重试（当前筛选会保留在地址栏中）。
            </p>
          </div>
        </div>
      </div>
    );
  }

  const projectData: Project[] = listData?.items?.map(mapProjectResponse) ?? [];
  const total = listData?.total ?? 0;

  const stats = statsData ?? {
    signing: 0,
    renovating: 0,
    selling: 0,
    sold: 0,
  };

  return (
    <div className="min-h-screen bg-fog">
      <div className="w-full max-w-400 mx-auto flex flex-col gap-8 py-8 px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-3xl text-ink">项目管理</h1>
          <p className="text-sm text-ash">全生命周期管理您的房源资产，从签约到售出的每一分钱。</p>
        </div>

        <ProjectStats stats={stats} />

        <ProjectView data={projectData} total={total} />

        <div className="mt-2 relative z-50 bg-card">
          <ProjectPagination total={total} />
        </div>

        <Suspense fallback={null}>
          <MonitorSheet />
        </Suspense>
      </div>
    </div>
  );
}
