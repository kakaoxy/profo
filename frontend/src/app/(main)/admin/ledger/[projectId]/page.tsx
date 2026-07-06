import { notFound } from "next/navigation";
import { fetchClient } from "@/lib/api-server";
import { extractApiData } from "@/lib/api-helpers";
import type { components } from "@/lib/api-types";
import { HeaderStats } from "@/app/(main)/admin/projects/[projectId]/cashflow/_components/header-stats";
import { TrendChart } from "@/app/(main)/admin/projects/[projectId]/cashflow/_components/trend-chart";
import type { CashFlowRecord, CashFlowStats } from "@/app/(main)/admin/projects/[projectId]/cashflow/types";
import { LedgerDetailHeader } from "./_components/ledger-detail-header";
import { LedgerDetailTable } from "./_components/ledger-detail-table";
import { LogsCard } from "./_components/logs-card";

type CashFlowResponse = components["schemas"]["CashFlowResponse"];
type ProjectResponse = components["schemas"]["ProjectResponse"];

interface PageProps {
  params: Promise<{ projectId: string }>;
}

export default async function LedgerDetailPage({ params }: PageProps) {
  const { projectId } = await params;

  const client = await fetchClient();

  // 并行获取流水数据与项目详情
  const [ledgerRes, projectRes] = await Promise.all([
    client.GET("/api/v1/admin/ledger/{project_id}", {
      params: { path: { project_id: projectId } },
    }),
    client.GET("/api/v1/projects/{project_id}", {
      params: { path: { project_id: projectId } },
    }),
  ]);

  // 流水数据获取失败 → 404
  if (ledgerRes.error || !ledgerRes.data) {
    notFound();
  }

  const ledgerData = extractApiData<CashFlowResponse>(ledgerRes.data);

  if (!ledgerData) {
    notFound();
  }

  // 项目详情（用于标题展示，失败时降级为 null）
  const projectData = projectRes.error
    ? null
    : (extractApiData<ProjectResponse>(projectRes.data) ?? null);

  const projectCode = projectData?.contract_no ?? null;
  const projectName = projectData?.community_name ?? projectData?.name ?? null;

  // 复用 HeaderStats / TrendChart：API 类型与组件 props 结构兼容
  const stats = ledgerData.summary as CashFlowStats;
  const records = ledgerData.records as unknown as CashFlowRecord[];

  return (
    <div className="min-h-screen bg-muted">
      <div className="w-full max-w-[1200px] mx-auto flex flex-col gap-6 py-8 px-4 sm:px-6 lg:px-8">
        <LedgerDetailHeader
          projectId={projectId}
          projectCode={projectCode}
          projectName={projectName}
        />

        {/* 汇总卡片 */}
        <section>
          <HeaderStats stats={stats} />
        </section>

        {/* 流水明细表格 */}
        <section>
          <LedgerDetailTable projectId={projectId} data={ledgerData.records} />
        </section>

        {/* 资金流向趋势 */}
        <section>
          <TrendChart data={records} />
        </section>

        {/* 操作日志 */}
        <section>
          <LogsCard projectId={projectId} />
        </section>
      </div>
    </div>
  );
}
