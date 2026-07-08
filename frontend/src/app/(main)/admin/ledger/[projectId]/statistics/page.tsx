import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { fetchClient } from "@/lib/api-server";
import { extractApiData } from "@/lib/api-helpers";
import type { components } from "@/lib/api-types";
import { StatisticsHero } from "./_components/statistics-hero";
import { ProjectBaseCard } from "./_components/project-base-card";
import { InvestmentCard } from "./_components/investment-card";
import { RenovationCard } from "./_components/renovation-card";
import { CommissionCard } from "./_components/commission-card";
import { DepositCard } from "./_components/deposit-card";
import { MarketingCard } from "./_components/marketing-card";
import { OperationCard } from "./_components/operation-card";

type ProjectLedgerStatisticsResponse =
  components["schemas"]["ProjectLedgerStatisticsResponse"];

interface PageProps {
  params: Promise<{ projectId: string }>;
}

export default async function LedgerStatisticsPage({ params }: PageProps) {
  const { projectId } = await params;

  const client = await fetchClient();
  const statsRes = await client.GET(
    "/api/v1/admin/ledger/{project_id}/statistics",
    { params: { path: { project_id: projectId } } },
  );

  // 统计数据获取失败 → 404
  if (statsRes.error || !statsRes.data) {
    notFound();
  }

  const stats = extractApiData<ProjectLedgerStatisticsResponse>(statsRes.data);

  if (!stats) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-[#f7f7f8]">
      <div className="w-full max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 pt-8">
        <Link
          href={`/admin/ledger/${projectId}`}
          className="text-sm font-medium text-graphite hover:text-ink transition-colors flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rust focus-visible:ring-offset-2 rounded-sm"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          返回流水明细
        </Link>
      </div>

      {/* Hero + KPI */}
      <section className="py-12">
        <div className="w-full max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8">
          <StatisticsHero summary={stats.summary} />
        </div>
      </section>

      {/* Row 1: 项目基础信息 + 投资情况 (白底) */}
      <section className="bg-white py-12">
        <div className="w-full max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-5">
              <ProjectBaseCard data={stats.project_base} />
            </div>
            <div className="lg:col-span-7">
              <InvestmentCard data={stats.investment} />
            </div>
          </div>
        </div>
      </section>

      {/* Row 2: 装修预算 + 渠道佣金 (灰底) */}
      <section className="bg-[#f7f7f8] py-12">
        <div className="w-full max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-8">
              <RenovationCard data={stats.renovation} />
            </div>
            <div className="lg:col-span-4">
              <CommissionCard data={stats.commission} />
            </div>
          </div>
        </div>
      </section>

      {/* Row 3: 履约保证金 + 营销推广费 + 运营成本 (白底) */}
      <section className="bg-white py-12">
        <div className="w-full max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <DepositCard data={stats.deposit} />
            <MarketingCard data={stats.marketing} />
            <OperationCard data={stats.operation} />
          </div>
        </div>
      </section>
    </div>
  );
}
