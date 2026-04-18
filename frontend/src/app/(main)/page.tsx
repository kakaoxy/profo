import { fetchClient } from "@/lib/api-server";
import Link from "next/link";
import {
  Building,
  TrendingUp,
  Folder,
  PhoneCall,
  ChevronRight,
  LayoutDashboard,
} from "lucide-react";
import { StatCard, LeadsTable } from "./_components";
import { formatCurrency, formatRelativeTime } from "./_lib";
import { mapBackendToFrontend } from "./leads/lib/utils";
import type { components } from "@/lib/api-types";

type ProjectStatsResponse = components["schemas"]["ProjectStatsResponse"];

async function getDashboardData() {
  const client = await fetchClient();

  const [propertiesRes, projectsStatsRes, pendingLeadsRes, signedLeadsRes] =
    await Promise.all([
      client.GET("/api/v1/properties", {
        params: { query: { page: 1, page_size: 1 } },
      }),
      client.GET("/api/v1/projects/stats", {}),
      client.GET("/api/v1/leads/", {
        params: {
          query: { page: 1, page_size: 5, statuses: ["pending_assessment"] },
        },
      }),
      client.GET("/api/v1/leads/", {
        params: { query: { page: 1, page_size: 1, statuses: ["signed"] } },
      }),
    ]);

  const backendLeads = pendingLeadsRes.data?.items || [];
  const leads = backendLeads.map(mapBackendToFrontend);

  return {
    propertiesTotal: propertiesRes.data?.total || 0,
    projectStats: projectsStatsRes.data || {},
    leads,
    pendingLeadsTotal: pendingLeadsRes.data?.total || 0,
    signedLeadsTotal: signedLeadsRes.data?.total || 0,
  };
}

export default async function DashboardPage() {
  const {
    propertiesTotal,
    projectStats,
    leads,
    pendingLeadsTotal,
    signedLeadsTotal,
  } = await getDashboardData();

  const stats = projectStats as ProjectStatsResponse;
  const signingCount = stats?.signing ?? 0;
  const renovatingCount = stats?.renovating ?? 0;
  const sellingCount = stats?.selling ?? 0;
  const soldCount = stats?.sold ?? 0;

  const totalActiveProjects = signingCount + renovatingCount + sellingCount;
  const getPercent = (val: number) =>
    totalActiveProjects > 0 ? (val / totalActiveProjects) * 100 : 0;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 p-4 md:p-8">
      <div className="mb-8 flex items-center gap-3">
        <div className="p-2 bg-white dark:bg-slate-800 rounded-lg shadow-sm">
          <LayoutDashboard className="w-6 h-6 text-slate-700 dark:text-slate-200" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            工作台
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            欢迎回来，这是您今日的数据概览
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 md:gap-6 mb-8">
        <Link href="/properties" className="block h-full group">
          <StatCard
            title="房源总数"
            value={propertiesTotal.toLocaleString()}
            icon={Building}
            className="h-full group-hover:border-blue-200 dark:group-hover:border-blue-800 transition-colors"
          />
        </Link>

        <Link href="/leads" className="block h-full group">
          <StatCard
            title="新增线索"
            value={`${pendingLeadsTotal}`}
            sub="待评估"
            icon={PhoneCall}
            iconColor="text-blue-500"
            className="h-full group-hover:border-blue-200 dark:group-hover:border-blue-800 transition-colors"
          />
        </Link>

        <Link href="/projects" className="block h-full group">
          <StatCard
            title="进行中项目"
            value={`${totalActiveProjects}`}
            sub={`签约 ${signingCount} / 改造 ${renovatingCount} / 销售 ${sellingCount}`}
            icon={Folder}
            className="h-full group-hover:border-blue-200 dark:group-hover:border-blue-800 transition-colors"
          />
        </Link>

        <div className="h-full">
          <StatCard
            title="已成交项目"
            value={`${soldCount}`}
            sub="累计成交"
            icon={TrendingUp}
            iconColor="text-green-500"
            trend={soldCount > 0 ? `+${soldCount}` : undefined}
            className="h-full"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6 mb-8">
        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
          <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-6">
            线索转化漏斗
          </h3>
          <div className="flex items-center justify-between mb-2">
            <div>
              <span className="text-3xl font-bold text-slate-900 dark:text-white mr-2 tabular-nums">
                {pendingLeadsTotal}
              </span>
              <span className="text-sm text-slate-500 dark:text-slate-400">
                待评估
              </span>
            </div>
            <div>
              <span className="text-3xl font-bold text-slate-900 dark:text-white mr-2 tabular-nums">
                {signedLeadsTotal}
              </span>
              <span className="text-sm text-slate-500 dark:text-slate-400">
                已签约
              </span>
            </div>
          </div>
          <div className="w-full h-3 bg-slate-100 dark:bg-slate-700 rounded-full mt-4 overflow-hidden flex">
            <div
              className="h-full bg-slate-800 dark:bg-slate-200"
              style={{
                width: `${
                  pendingLeadsTotal + signedLeadsTotal > 0
                    ? (signedLeadsTotal /
                        (pendingLeadsTotal + signedLeadsTotal)) *
                      100
                    : 0
                }%`,
              }}
            />
          </div>
          <p className="text-xs text-slate-400 mt-3 text-right">
            转化率:{" "}
            {pendingLeadsTotal + signedLeadsTotal > 0
              ? (
                  (signedLeadsTotal / (pendingLeadsTotal + signedLeadsTotal)) *
                  100
                ).toFixed(1)
              : 0}
            %
          </p>
        </div>

        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
          <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-6">
            项目阶段分布
          </h3>

          <div className="flex items-center justify-between gap-4">
            <div className="flex flex-col">
              <span className="text-xs text-slate-500 mb-1">改造中</span>
              <span className="text-2xl font-bold text-amber-500 dark:text-amber-400 tabular-nums">
                {renovatingCount}
              </span>
            </div>
            <div className="flex flex-col text-right">
              <span className="text-xs text-slate-500 mb-1">销售中</span>
              <span className="text-2xl font-bold text-blue-600 dark:text-blue-400 tabular-nums">
                {sellingCount}
              </span>
            </div>
          </div>

          <div className="flex w-full h-3 rounded-full overflow-hidden mt-5 bg-slate-100 dark:bg-slate-700">
            <div
              className="h-full bg-slate-400"
              style={{ width: `${getPercent(signingCount)}%` }}
            />
            <div
              className="h-full bg-amber-500"
              style={{ width: `${getPercent(renovatingCount)}%` }}
            />
            <div
              className="h-full bg-blue-500"
              style={{ width: `${getPercent(sellingCount)}%` }}
            />
          </div>

          <div className="flex justify-between mt-3 text-xs text-slate-400">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-slate-400"></span> 签约 (
              {signingCount})
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-500"></span> 改造 (
              {renovatingCount})
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-blue-500"></span> 销售 (
              {sellingCount})
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-2 h-5 bg-red-500 rounded-full"></div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">
              待处理线索
            </h3>
          </div>
          <Link
            href="/leads"
            className="text-sm font-medium text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors flex items-center gap-1"
          >
            全部线索 <ChevronRight className="w-4 h-4" />
          </Link>
        </div>

        <LeadsTable
          leads={leads}
          formatCurrency={formatCurrency}
          formatRelativeTime={formatRelativeTime}
        />
      </div>
    </div>
  );
}
