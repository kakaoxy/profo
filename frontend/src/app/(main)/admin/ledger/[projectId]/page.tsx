import { notFound } from "next/navigation";
import { fetchClient } from "@/lib/api-server";
import { extractApiData } from "@/lib/api-helpers";
import type { components } from "@/lib/api-types";
import { HeaderStats } from "./_components/header-stats";
import { TrendChart } from "./_components/trend-chart";
import { LedgerDetailHeader } from "./_components/ledger-detail-header";
import { LedgerDetailTable } from "./_components/ledger-detail-table";
import { LogsCard } from "./_components/logs-card";

type CashFlowResponse = components["schemas"]["CashFlowResponse"];
type ProjectResponse = components["schemas"]["ProjectResponse"];
type FinanceLogResponse = components["schemas"]["FinanceLogResponse"];

interface PageProps {
  params: Promise<{ projectId: string }>;
}

export default async function LedgerDetailPage({ params }: PageProps) {
  const { projectId } = await params;

  const client = await fetchClient();

  // 并行获取流水数据、项目详情、操作日志
  const [ledgerRes, projectRes, logsRes] = await Promise.all([
    client.GET("/api/v1/admin/ledger/{project_id}", {
      params: { path: { project_id: projectId } },
    }),
    client.GET("/api/v1/projects/{project_id}", {
      params: { path: { project_id: projectId } },
    }),
    client.GET("/api/v1/admin/ledger/{project_id}/logs", {
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

  // 项目详情（用于基础信息展示，失败时降级为 null）
  const projectData = projectRes.error
    ? null
    : (extractApiData<ProjectResponse>(projectRes.data) ?? null);

  // 操作日志（失败时降级为空数组）
  const logs: FinanceLogResponse[] = logsRes.error
    ? []
    : (extractApiData<FinanceLogResponse[]>(logsRes.data) ?? []);

  // 项目基础信息（传入 HeaderStats 左栏）
  const projectInfo = projectData
    ? {
        contract_no: projectData.contract_no ?? null,
        community_name: projectData.community_name ?? null,
        address: projectData.address ?? null,
        area: projectData.area ?? null,
        floor_info: projectData.floor_info ?? null,
      }
    : null;

  // 复用 HeaderStats / TrendChart：API 类型与组件 props 结构兼容
  // F1: CashFlowStats 已是 CashFlowSummary 别名，无需断言
  const stats = ledgerData.summary;

  return (
    <div className="min-h-screen bg-[#f7f7f8]">
      <div className="w-full max-w-300 mx-auto flex flex-col gap-12 py-10 px-4 sm:px-6 lg:px-8">
        <LedgerDetailHeader projectId={projectId} />

        {/* 汇总卡片（三栏：基础信息 | 现金流 | ROI） */}
        <section>
          <HeaderStats stats={stats} projectInfo={projectInfo} />
        </section>

        {/* 流水明细表格 */}
        <section>
          <LedgerDetailTable
            projectId={projectId}
            data={ledgerData.records}
            businessForm={projectData?.business_form ?? null}
            settlementStatus={projectData?.finance_settlement_status ?? null}
          />
        </section>

        {/* 资金流向趋势 */}
        <section>
          <TrendChart data={ledgerData.records} />
        </section>

        {/* 操作日志 */}
        <section>
          <LogsCard logs={logs} />
        </section>
      </div>
    </div>
  );
}
