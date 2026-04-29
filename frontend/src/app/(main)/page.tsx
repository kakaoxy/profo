import { LayoutDashboard, Plus, Filter, SortAsc } from "lucide-react";
import {
  ProjectCardList,
  ProjectOverviewCard,
  LeadsFunnelCard,
  AlertCard,
  DashboardLeadsTable,
} from "./_components";
import { CreateProjectDialog } from "./projects/_components/create-project";
import { sortProjects } from "@/lib/project-sort";
import { getDashboardData } from "./_lib/dashboard-data";

export default async function DashboardPage() {
  const {
    projectStats,
    pendingLeadsTotal,
    funnelData,
    projects,
    leads,
    marketDataMap,
    errors,
  } = await getDashboardData();

  const sortedProjects = sortProjects(projects);

  const signingCount = projectStats?.signing ?? 0;
  const renovatingCount = projectStats?.renovating ?? 0;
  const sellingCount = projectStats?.selling ?? 0;
  const soldCount = projectStats?.sold ?? 0;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 p-4 md:p-8 min-w-0 overflow-x-hidden">
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

      {/* Error Banner */}
      {Object.keys(errors).length > 0 && (
        <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
          <p className="text-sm text-amber-700 dark:text-amber-400">
            部分数据加载失败，请刷新页面重试
          </p>
        </div>
      )}

      {/* Top Row - Three Column Layout */}
      <div className="grid grid-cols-12 gap-4 lg:gap-6 mb-8 min-w-0">
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
            重点监控项目
          </h3>
          <div className="flex gap-2">
            <button
              disabled
              className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-400 cursor-not-allowed opacity-60"
              title="筛选功能开发中"
              aria-label="筛选功能开发中"
            >
              <Filter className="w-4 h-4" />
            </button>
            <button
              disabled
              className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-400 cursor-not-allowed opacity-60"
              title="排序功能开发中"
              aria-label="排序功能开发中"
            >
              <SortAsc className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex gap-4 overflow-x-auto pb-4 pt-2 custom-scrollbar">
          <ProjectCardList projects={sortedProjects} marketDataMap={marketDataMap} />

          <CreateProjectDialog
            trigger={
              <div className="w-[280px] shrink-0 bg-slate-50 dark:bg-slate-800/50 rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-700 flex flex-col items-center justify-center p-6 text-center group cursor-pointer hover:bg-white dark:hover:bg-slate-800 hover:border-primary/40 transition-all min-h-[400px]">
                <div className="w-14 h-14 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-slate-400 mb-5 group-hover:bg-primary group-hover:text-white transition-all shadow-sm">
                  <Plus className="w-8 h-8" />
                </div>
                <h4 className="text-lg font-bold text-slate-500 group-hover:text-primary dark:text-slate-400 dark:group-hover:text-primary">
                  添加新项目
                </h4>
                <p className="text-xs text-slate-400 mt-2 max-w-[140px]">
                  快速录入房源或新建开发项目
                </p>
              </div>
            }
          />
        </div>
      </section>

      {/* Leads Table Section */}
      <DashboardLeadsTable leads={leads} />
    </div>
  );
}
