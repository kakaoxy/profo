// src/app/(main)/projects/[projectId]/cashflow/page.tsx

import { Suspense } from "react";
import { notFound } from "next/navigation";
import { Loader2 } from "lucide-react";

import { fetchClient } from "@/lib/api-server";
import { extractApiData } from "@/lib/api-helpers";
import type { components } from "@/lib/api-types";
import { HeaderStats } from "./_components/header-stats";
import { TrendChart } from "./_components/trend-chart";
import { LedgerTable } from "./_components/ledger-table";
import { getProjectCashFlowAction } from "./actions";
import { mapToCashFlowRecord, mapToCashFlowStats } from "./types";

type ProjectResponse = components["schemas"]["ProjectResponse"];

interface PageProps {
  params: Promise<{ projectId: string }>;
}

export default async function CashFlowPage({ params }: PageProps) {
  const { projectId } = await params;

  // 1. 并行获取流水数据与项目详情（项目详情用于 business_form）
  const [apiData, projectRes] = await Promise.all([
    getProjectCashFlowAction(projectId),
    (async () => {
      const client = await fetchClient();
      return client.GET("/api/v1/projects/{project_id}", {
        params: { path: { project_id: projectId } },
      });
    })(),
  ]);

  if (!apiData) {
    return notFound();
  }

  const records = apiData.records.map((r) => mapToCashFlowRecord(r, projectId));
  const stats = mapToCashFlowStats(apiData.summary);

  const projectData = projectRes.error
    ? null
    : (extractApiData<ProjectResponse>(projectRes.data) ?? null);
  const businessForm = projectData?.business_form ?? null;

  return (
    <div className="min-h-screen bg-muted/50 p-4 sm:p-6 lg:p-8 space-y-6 max-w-[1200px] mx-auto">
      {/* 标题区 */}
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          资金账本
        </h1>
        <p className="text-sm text-muted-foreground">
          全周期资金流向监控，即时核算项目盈亏。
        </p>
      </div>

      {/* 1. 宏观概览 */}
      <section>
        <HeaderStats stats={stats} />
      </section>

      {/* 2. 趋势洞察 */}
      <section>
        <TrendChart data={records} />
      </section>

      {/* 3. 微观账本 */}
      <section>
        <Suspense
          fallback={
            <div className="flex justify-center p-8">
              <Loader2 className="animate-spin" />
            </div>
          }
        >
          <LedgerTable
            projectId={projectId}
            data={records}
            businessForm={businessForm}
          />
        </Suspense>
      </section>
    </div>
  );
}
