import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { fetchClient } from "@/lib/api-server";
import { extractApiData } from "@/lib/api-helpers";
import type { components } from "@/lib/api-types";
import { PageContainer } from "@/app/(main)/admin/_components";
import { StatisticsHero } from "./_components/statistics-hero";
import { ProfitLadder } from "./_components/profit-ladder";
import { StageCashflowTimeline } from "./_components/stage-cashflow-timeline";

type ProjectLedgerStatisticsResponse = components["schemas"]["ProjectLedgerStatisticsResponse"];

interface PageProps {
  params: Promise<{ projectId: string }>;
}

export default async function LedgerStatisticsPage({ params }: PageProps) {
  // params 与 fetchClient 无依赖,并行化避免串行 await
  const [{ projectId }, client] = await Promise.all([params, fetchClient()]);
  const statsRes = await client.GET("/api/v1/admin/ledger/{project_id}/statistics", {
    params: { path: { project_id: projectId } },
  });

  // 统计数据获取失败 → 404
  if (statsRes.error || !statsRes.data) {
    notFound();
  }

  const stats = extractApiData<ProjectLedgerStatisticsResponse>(statsRes.data);

  if (!stats) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-fog">
      {/* 返回链接 + Hero + 8 KPI */}
      <PageContainer className="flex flex-col gap-8">
        <Link
          href={`/admin/ledger/${projectId}`}
          className="text-sm font-medium text-graphite hover:text-ink transition-colors flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rust focus-visible:ring-offset-2 rounded-sm"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          返回流水明细
        </Link>
        <StatisticsHero kpi={stats.kpi} />
      </PageContainer>

      {/* 利润三层结构 + 计算明细入口 */}
      <ProfitLadder
        fiveLayer={stats.five_layer}
        breakdown={stats.breakdown}
        businessForm={stats.breakdown.business_form}
      />

      {/* 全周期阶段现金流量表 */}
      <StageCashflowTimeline stageFlows={stats.stage_flows} />
    </div>
  );
}
