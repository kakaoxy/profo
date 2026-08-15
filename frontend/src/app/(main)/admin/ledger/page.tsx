import { fetchClient } from "@/lib/api-server";
import { LedgerStats } from "./_components/ledger-stats";
import { LedgerView } from "./_components/ledger-view";
import { LedgerPagination } from "./_components/ledger-pagination";
import type { components, paths } from "@/lib/api-types";

type LedgerListResponse = components["schemas"]["LedgerListResponse"];
type LedgerStatsResponse = components["schemas"]["LedgerStatsResponse"];
type LedgerProjectListItem = components["schemas"]["LedgerProjectListItem"];

type ListQuery = NonNullable<paths["/api/v1/admin/ledger"]["get"]["parameters"]["query"]>;

interface PageProps {
  searchParams: Promise<{
    search?: string;
    project_status?: string;
    page?: string;
    page_size?: string;
  }>;
}

const DEFAULT_PAGE_SIZE = 10;

export default async function LedgerPage({ searchParams }: PageProps) {
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

  const client = await fetchClient();

  const [statsRes, listRes] = await Promise.all([
    client.GET("/api/v1/admin/ledger/stats", {}),
    client.GET("/api/v1/admin/ledger", {
      params: { query },
    }),
  ]);

  const listData = listRes.data as LedgerListResponse | null;
  const items: LedgerProjectListItem[] = listData?.items ?? [];
  const total = listData?.total ?? 0;

  const stats = (statsRes.data as LedgerStatsResponse | null) ?? {
    total_projects: 0,
    total_income: 0,
    total_expense: 0,
    net_cash_flow: 0,
    total_records: 0,
  };

  return (
    <div className="min-h-screen bg-muted">
      <div className="w-full max-w-400 mx-auto flex flex-col gap-8 py-8 px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">资金账本</h1>
          <p className="text-sm text-muted-foreground">
            管理和追踪所有项目的资金流水，按项目聚合查看收支与 ROI
          </p>
        </div>

        <LedgerStats stats={stats} />

        <LedgerView data={items} total={total} />

        <div className="relative z-50 bg-card">
          <LedgerPagination total={total} />
        </div>
      </div>
    </div>
  );
}
