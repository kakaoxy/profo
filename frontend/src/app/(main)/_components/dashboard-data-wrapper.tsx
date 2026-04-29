/**
 * 工作台数据包装组件
 * 配合 Suspense 使用，分离数据获取和渲染
 * 使用 React.cache 确保同一次请求中数据只获取一次
 */

import { getDashboardData } from "../_lib/dashboard-data";
import { sortProjects } from "@/lib/project-sort";
import {
  ProjectCardList,
  ProjectOverviewCard,
  LeadsFunnelCard,
  AlertCard,
  DashboardLeadsTable,
} from "./";

export async function DashboardErrorWrapper() {
  const { errors } = await getDashboardData();

  if (Object.keys(errors).length === 0) return null;

  return (
    <div className="col-span-12 mb-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
      <p className="text-sm text-amber-700 dark:text-amber-400">
        部分数据加载失败，请刷新页面重试
      </p>
    </div>
  );
}

export async function DashboardOverviewWrapper() {
  const { projectStats } = await getDashboardData();

  return (
    <ProjectOverviewCard
      signingCount={projectStats?.signing ?? 0}
      renovatingCount={projectStats?.renovating ?? 0}
      sellingCount={projectStats?.selling ?? 0}
      soldCount={projectStats?.sold ?? 0}
    />
  );
}

export async function DashboardFunnelWrapper() {
  const { funnelData } = await getDashboardData();

  return <LeadsFunnelCard funnelData={funnelData} />;
}

export async function DashboardAlertWrapper() {
  const { pendingLeadsTotal } = await getDashboardData();

  return <AlertCard count={pendingLeadsTotal} />;
}

export async function DashboardProjectsWrapper() {
  const { projects, marketDataMap } = await getDashboardData();
  const sortedProjects = sortProjects(projects);

  return <ProjectCardList projects={sortedProjects} marketDataMap={marketDataMap} />;
}

export async function DashboardLeadsWrapper() {
  const { leads } = await getDashboardData();

  return <DashboardLeadsTable leads={leads} />;
}
