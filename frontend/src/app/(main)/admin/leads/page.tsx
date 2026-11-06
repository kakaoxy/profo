import { fetchClient } from "@/lib/api-server";
import { LeadsView } from "./_components/leads-view";
import type { Lead, LeadFilterOption } from "./types";
import type { components, operations } from "@/lib/api-types";
import { mapBackendToFrontend } from "./lib/utils";

interface PageProps {
  searchParams: Promise<{
    search?: string;
    statuses?: string;
    district?: string;
    creator_id?: string;
    store_id?: string;
    broker_id?: string;
    owner_employee_id?: string;
    leadId?: string;
    page?: string;
    page_size?: string;
  }>;
}

type LeadsQuery = operations["get_leads_api_v1_leads_get"]["parameters"]["query"];
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
    queryParams.statuses = params.statuses.split(",") as NonNullable<LeadsQuery>["statuses"];
  }

  if (params.district) {
    queryParams.district = params.district;
  }

  if (params.creator_id) {
    queryParams.creator_id = params.creator_id;
  }

  // 归属筛选：门店、经纪人、对接人
  if (params.store_id) {
    queryParams.store_id = params.store_id;
  }

  if (params.broker_id) {
    queryParams.broker_id = params.broker_id;
  }

  if (params.owner_employee_id) {
    queryParams.owner_employee_id = params.owner_employee_id;
  }

  // 并行获取线索列表、状态统计与归属筛选下拉数据（统计不受分页影响）
  const [listRes, statsRes, storesRes, brokersRes, usersRes] = await Promise.all([
    client.GET("/api/v1/leads", {
      params: { query: queryParams },
    }),
    client.GET("/api/v1/leads/stats", {}),
    // 门店/经纪人筛选选项：包含停用/合并历史项（历史线索仍可筛）
    client.GET("/api/v1/admin/merchant/stores", {
      params: { query: { page: 1, page_size: 200 } },
    }),
    // 经纪人选项走 merchant:read 轻量接口（不暴露手机号，员工也可用）
    client.GET("/api/v1/admin/merchant/brokers/options", {
      params: { query: {} },
    }),
    client.GET("/api/v1/users/simple", {
      params: { query: { status: "active" } },
    }),
  ]);

  const leads: Lead[] = (listRes.data?.items || []).map(mapBackendToFrontend);
  // 列表接口失败时不再静默当空列表（否则错误会被误渲染成「这个筛选下没有线索」），
  // 改由 LeadsView 渲染错误态（保留页头/工具栏，可重试）
  const listError = Boolean(listRes.error);
  const total = listRes.data?.total ?? 0;
  const stats: LeadStatsResponse = (statsRes.data as LeadStatsResponse | null) ?? {
    pending_assessment: 0,
    pending_visit: 0,
    visited: 0,
    signed: 0,
    rejected: 0,
    lost_to_competitor: 0,
  };

  // 创建人筛选标签展示名：取当前页首条线索的 creator_name（后端已按 creator_id 过滤）
  const creatorName = params.creator_id ? leads[0]?.creatorName : undefined;

  // 归属筛选下拉选项（无权限/加载失败时为空数组，工具栏自动隐藏对应下拉）
  const storeOptions: LeadFilterOption[] = (storesRes.data?.items || []).map((store) => ({
    id: store.id,
    name: store.store_name,
    status: store.status,
  }));
  const brokerOptions: LeadFilterOption[] = (brokersRes.data?.items || []).map((broker) => ({
    id: broker.id,
    name: broker.name,
  }));
  const employeeOptions: LeadFilterOption[] = (usersRes.data?.items || []).map((user) => ({
    id: user.id,
    name: user.nickname || user.username,
  }));

  return (
    <div className="min-h-screen bg-fog">
      <LeadsView
        initialLeads={leads}
        total={total}
        stats={stats}
        listError={listError}
        initialSelectedLeadId={params.leadId}
        creatorId={params.creator_id}
        creatorName={creatorName}
        storeOptions={storeOptions}
        brokerOptions={brokerOptions}
        employeeOptions={employeeOptions}
      />
    </div>
  );
}
