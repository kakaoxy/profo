// src/app/(main)/projects/[projectId]/cashflow/page.tsx

import { Suspense } from "react";
import { notFound } from "next/navigation";
import { Loader2 } from "lucide-react";

import { HeaderStats } from "./_components/header-stats";
import { TrendChart } from "./_components/trend-chart";
import { LedgerTable } from "./_components/ledger-table";
import { getProjectCashFlowAction } from "./actions";
import { mapToCashFlowRecord, mapToCashFlowStats } from "./types";

interface PageProps {
  params: Promise<{ projectId: string }>;
}

export default async function CashFlowPage({ params }: PageProps) {
  const { projectId } = await params;

  // 1. 调用 Server Action 获取真实数据
  const apiData = await getProjectCashFlowAction(projectId);

  if (!apiData) {
    return notFound();
  }

  const records = apiData.records.map((r) => mapToCashFlowRecord(r, projectId));
  const stats = mapToCashFlowStats(apiData.summary);

  return (
    <div className="min-h-screen bg-slate-50/50 p-4 sm:p-6 lg:p-8 space-y-6 max-w-[1200px] mx-auto">
      {/* 标题区 */}
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          资金账本
        </h1>
        <p className="text-sm text-slate-500">
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
          <LedgerTable projectId={projectId} data={records} />
        </Suspense>
      </section>
    </div>
  );
}
