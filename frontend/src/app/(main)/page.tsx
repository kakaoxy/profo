import { fetchClient } from "@/lib/api-server";
import Link from "next/link";
import { LayoutDashboard, Plus, Filter, SortAsc } from "lucide-react";
import {
  ProjectCard,
  ProjectOverviewCard,
  LeadsFunnelCard,
  AlertCard,
  DashboardLeadsTable,
} from "./_components";
import { MOCK_PROJECTS, MOCK_LEADS } from "./_lib/dashboard-data";
import type { components } from "@/lib/api-types";
import type { FunnelData } from "./types";

type ProjectStatsResponse = components["schemas"]["ProjectStatsResponse"];

async function getDashboardData() {
  const client = await fetchClient();

  const [projectsStatsRes, pendingLeadsRes, funnelRes] =
    await Promise.all([
      client.GET("/api/v1/projects/stats", {}),
      client.GET("/api/v1/leads/", {
        params: {
          query: { page: 1, page_size: 5, statuses: ["pending_assessment"] },
        },
      }),
      client.GET("/api/v1/leads/stats/funnel", {}),
    ]);

  const funnelData: FunnelData = funnelRes.data
    ? (funnelRes.data as FunnelData)
    : { total: 0, evaluating: 0, rejected: 0, visiting: 0, signed: 0 };

  return {
    projectStats: projectsStatsRes.data || {},
    pendingLeadsTotal: pendingLeadsRes.data?.total || 0,
    funnelData,
  };
}

export default async function DashboardPage() {
  const {
    projectStats,
    pendingLeadsTotal,
    funnelData,
  } = await getDashboardData();

  const stats = projectStats as ProjectStatsResponse;
  const signingCount = stats?.signing ?? 0;
  const renovatingCount = stats?.renovating ?? 0;
  const sellingCount = stats?.selling ?? 0;
  const soldCount = stats?.sold ?? 0;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 p-4 md:p-8">
      {/* Header */}
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

      {/* Top Row - Three Column Layout */}
      <div className="grid grid-cols-12 gap-6 mb-8">
        <ProjectOverviewCard
          signingCount={signingCount}
          renovatingCount={renovatingCount}
          sellingCount={sellingCount}
          soldCount={soldCount}
        />
        <LeadsFunnelCard funnelData={funnelData} />
        <AlertCard count={pendingLeadsTotal} />
      </div>

      {/* Monitor Projects Section */}
      <section className="mb-8">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-bold text-on-surface dark:text-white">
            重点监控项目 Monitor Projects
          </h3>
          <div className="flex gap-2">
            <button className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-400 hover:text-primary transition-colors hover:shadow-sm">
              <Filter className="w-4 h-4" />
            </button>
            <button className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-400 hover:text-primary transition-colors hover:shadow-sm">
              <SortAsc className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex gap-6 overflow-x-auto pb-6 pt-2 -mx-4 px-4 custom-scrollbar">
          {MOCK_PROJECTS.map((project) => (
            <div key={project.id} className="w-[320px] shrink-0">
              <ProjectCard project={project} />
            </div>
          ))}

          <Link
            href="/projects/new"
            className="w-[320px] shrink-0 bg-slate-50 dark:bg-slate-800/50 rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-700 flex flex-col items-center justify-center p-8 text-center group cursor-pointer hover:bg-white dark:hover:bg-slate-800 hover:border-primary/40 transition-all min-h-[440px]"
          >
            <div className="w-14 h-14 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-slate-400 mb-5 group-hover:bg-primary group-hover:text-white transition-all shadow-sm">
              <Plus className="w-8 h-8" />
            </div>
            <h4 className="text-lg font-bold text-slate-500 group-hover:text-primary dark:text-slate-400 dark:group-hover:text-primary">
              添加新项目
            </h4>
            <p className="text-xs text-slate-400 mt-2 max-w-[140px]">
              快速录入房源或新建开发项目
            </p>
          </Link>
        </div>
      </section>

      {/* Leads Table Section */}
      <DashboardLeadsTable leads={MOCK_LEADS} />
    </div>
  );
}
