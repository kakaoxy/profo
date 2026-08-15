import { fetchClient } from "@/lib/api-server";
import { InvestmentStats } from "./_components/investment-stats";
import { InvestmentsView } from "./_components/investments-view";
import { InvestmentsPagination } from "./_components/investments-pagination";
import type { components, paths } from "@/lib/api-types";

type InvestmentListResponse = components["schemas"]["InvestmentListResponse"];
type InvestmentStatsResponse = components["schemas"]["InvestmentStatsResponse"];
type InvestmentListItem = components["schemas"]["InvestmentListItemResponse"];

type ListQuery = NonNullable<paths["/api/v1/admin/investments"]["get"]["parameters"]["query"]>;

interface PageProps {
  searchParams: Promise<{
    search?: string;
    project_status?: string;
    settlement_status?: string;
    page?: string;
    page_size?: string;
  }>;
}

const DEFAULT_PAGE_SIZE = 10;

export default async function InvestmentsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const page = Number(params.page) || 1;
  const page_size = Number(params.page_size) || DEFAULT_PAGE_SIZE;

  const query: ListQuery = {
    page,
    page_size,
  };
  if (params.search && params.search.trim()) {
    query.search = params.search.trim();
  }
  if (params.project_status && params.project_status !== "all") {
    query.project_status = params.project_status as ListQuery["project_status"];
  }
  if (params.settlement_status && params.settlement_status !== "all") {
    query.settlement_status = params.settlement_status as ListQuery["settlement_status"];
  }

  const client = await fetchClient();

  const [statsRes, listRes] = await Promise.all([
    client.GET("/api/v1/admin/investments/stats", {}),
    client.GET("/api/v1/admin/investments", {
      params: { query },
    }),
  ]);

  const listData = listRes.data as InvestmentListResponse | null;
  const items: InvestmentListItem[] = listData?.items ?? [];
  const total = listData?.total ?? 0;

  const stats = (statsRes.data as InvestmentStatsResponse | null) ?? {
    total_projects: 0,
    total_investment: "0",
    total_return: "0",
    avg_return_ratio: 0,
    unsettled_count: 0,
  };

  return (
    <div className="min-h-screen bg-muted">
      <div className="w-full max-w-400 mx-auto flex flex-col gap-8 py-8 px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">跟投管理</h1>
          <p className="text-sm text-muted-foreground">
            管理和追踪所有项目的投资方信息，从录入到结算全流程
          </p>
        </div>

        <InvestmentStats stats={stats} />

        <InvestmentsView data={items} total={total} />

        <div className="relative z-50 bg-card">
          <InvestmentsPagination total={total} />
        </div>
      </div>
    </div>
  );
}
