import { fetchClient } from "@/lib/api-server";
import { PageContainer, PageHeader } from "@/app/(main)/admin/_components";
import { Info, Landmark } from "lucide-react";
import Link from "next/link";
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
    <div className="min-h-screen bg-fog">
      <PageContainer className="flex flex-col gap-8">
        <PageHeader
          title="项目账本"
          description="每套房赚了多少。项目看盈亏，账户看钱在哪。"
          actions={
            <Link
              href="/admin/accounts"
              className="inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-[13.5px] text-ink ring-1 ring-dove/30 transition-colors hover:bg-fog"
            >
              <Landmark className="h-3.5 w-3.5" aria-hidden="true" />
              资金账户
            </Link>
          }
        />

        {/* 改名说明：只改中文，路由与权限码不动（SPEC §5 T20） */}
        <div className="flex items-start gap-2 rounded-2xl bg-sky-wash px-4 py-3 text-[12.5px] leading-relaxed text-[#2b5391]">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>
            <b>改了名字：</b>原来叫「资金账本」，容易和「资金账户」混，现在叫
            <b>项目账本</b>。功能和数据都没变。
          </span>
        </div>

        <LedgerStats stats={stats} />

        <LedgerView data={items} total={total} />

        <div className="relative z-50">
          <LedgerPagination total={total} />
        </div>
      </PageContainer>
    </div>
  );
}
