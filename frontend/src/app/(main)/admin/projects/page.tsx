import { fetchClient } from "@/lib/api-server";
import { isRedirectError } from "@/lib/auth/server/session";
import { logger } from "@/lib/logger";
import { PageContainer } from "@/app/(main)/admin/_components";
import { ProjectView } from "./_components/project-view";
import { Project } from "./types";
import type { paths, components } from "@/lib/api-types";
import { toNumber } from "@/lib/number-utils";

type ProjectListResponse =
  paths["/api/v1/projects"]["get"]["responses"][200]["content"]["application/json"];

type CommunityListResponse =
  components["schemas"]["schemas__community__CommunityListResponse"];

type ApiProjectItem = components["schemas"]["ProjectResponse"];

function mapProjectResponse(
  item: ApiProjectItem,
  community?: components["schemas"]["CommunityResponse"],
): Project {
  const district = community?.district ?? null;
  const businessCircle = community?.business_circle ?? null;
  return {
    id: item.id,
    name: item.name ?? "",
    status: item.status,
    created_at: item.created_at,
    updated_at: item.updated_at,
    community_id: item.community_id ?? undefined,
    community_name: item.community_name ?? undefined,
    district: district ?? undefined,
    business_circle: businessCircle ?? undefined,
    address: item.address ?? undefined,
    // 字典解析名称（surface-dict-binding-info；pending 时为待审名称）
    building_no: item.building_no ?? null,
    room_no: item.room_no ?? null,
    dict_status: (item.dict_status ?? null) as Project["dict_status"],
    area: toNumber(item.area),
    layout: item.layout ?? undefined,
    orientation: item.orientation ?? undefined,
    floor_info: item.floor_info ?? undefined,
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
    // 归档状态（列表徽标 / 抽屉写入口收敛判据）
    is_archived: item.is_archived ?? false,
    archived_at: item.archived_at ?? null,
    archived_note: item.archived_note ?? null,
    // 可归档派生字段（ActionCell 归档入口显隐判据，单一权威源 ARCHIVABLE_STATUSES）
    can_archive: item.can_archive ?? false,
  };
}

export default async function ProjectsPage() {
  const client = await fetchClient();

  let projects: Project[] = [];
  try {
    const first = await client.GET("/api/v1/projects", {
      params: { query: { page: 1, page_size: 200, contract_sort: true } },
    });
    if (first.error || !first.data) throw first.error ?? new Error("项目列表为空");

    const firstData = first.data as ProjectListResponse;
    const pageSize = 200;
    const pageCount = Math.max(1, Math.ceil(firstData.total / pageSize));
    const rest = pageCount > 1
      ? await Promise.all(
          Array.from({ length: pageCount - 1 }, (_, index) =>
            client.GET("/api/v1/projects", {
              params: { query: { page: index + 2, page_size: pageSize, contract_sort: true } },
            }),
          ),
        )
      : [];
    const allItems = [
      ...(firstData.items ?? []),
      ...rest.flatMap((response) => ((response.data as ProjectListResponse | null)?.items ?? [])),
    ];

    // 行政区/商圈是小区字典的展示字段，列表接口不返回；在此按 community_id 映射。
    let communities: components["schemas"]["CommunityResponse"][] = [];
    try {
      const communityRes = await client.GET("/api/v1/admin/communities", {
        params: { query: { page: 1, page_size: 200 } },
      });
      communities = (communityRes.data as CommunityListResponse | null)?.items ?? [];
    } catch {
      // 小区字典不可用时不影响项目列表主体，仅缺失行政区/商圈展示。
    }
    const communityById = new Map(communities.map((community) => [community.id, community]));
    const communityByName = new Map(communities.map((community) => [community.name, community]));
    // 过滤本地 E2E 夹具（__E2E_BR...），避免测试项目污染业务列表；不影响真实项目。
    const visibleItems = allItems.filter((item) => !item.name?.startsWith("__E2E_"));
    projects = visibleItems.map((item) =>
      mapProjectResponse(
        item,
        communityById.get(item.community_id ?? "") ??
          communityByName.get(item.community_name ?? ""),
      ),
    );
  } catch (e) {
    // 401 场景 fetchClient 会抛 NEXT_REDIRECT 交由 Next.js 渲染层执行刷新重定向。
    if (isRedirectError(e)) throw e;
    logger.error("项目管理列表数据获取失败", e);
    return (
      <div className="min-h-screen bg-fog">
        <PageContainer className="flex flex-col gap-7 pb-10 pt-2">
          <header>
            <p className="text-[10px] font-[480] uppercase tracking-[0.16em] text-graphite">Projects <span className="mx-2 text-rust">·</span> 资产全周期</p>
            <h1 className="mt-3 font-signifier text-[44px] font-[420] leading-none tracking-[-0.02em] text-ink">项目管理</h1>
          </header>
          <div className="rounded-cards bg-white p-10 text-center shadow-steep">
            <p className="text-sm text-ash">数据加载失败，请刷新重试（当前筛选会保留在地址栏中）。</p>
          </div>
        </PageContainer>
      </div>
    );
  }

  return <ProjectView data={projects} />;
}
