/**
 * 工作台数据包装组件
 * 配合 Suspense 使用，分离数据获取和渲染
 * 使用 React.cache 确保同一次请求中数据只获取一次
 */

import { getDashboardData } from "../_lib/dashboard-data";
import {
  ProjectCardList,
  ProjectOverviewCard,
  LeadsFunnelCard,
  AlertCard,
  DashboardLeadsTable,
  QuickEntrySection,
} from "./";

export async function DashboardErrorWrapper() {
  const { errors } = await getDashboardData();

  if (Object.keys(errors).length === 0) return null;

  const failedList = Object.entries(errors).map(([, msg]) => msg);

  return (
    <div
      role="alert"
      aria-live="polite"
      aria-atomic="true"
      className="col-span-12 mb-4 p-3 bg-status-pending/10 dark:bg-amber-900/20 border border-status-pending/30 dark:border-amber-800 rounded-lg"
    >
      <p className="text-sm text-amber-700 dark:text-amber-400 font-medium">
        部分数据加载失败，请刷新页面重试
      </p>
      <ul className="mt-1 text-xs text-amber-700/80 dark:text-amber-400/80 list-disc list-inside">
        {failedList.map((msg) => (
          <li key={msg}>{msg}</li>
        ))}
      </ul>
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

  return <ProjectCardList projects={projects} marketDataMap={marketDataMap} />;
}

export async function DashboardLeadsWrapper() {
  const { leads } = await getDashboardData();

  return <DashboardLeadsTable leads={leads} />;
}

export async function DashboardQuickEntryWrapper() {
  const { renovationProjects, sellingProjects } = await getDashboardData();
  return (
    <QuickEntrySection renovationProjects={renovationProjects} sellingProjects={sellingProjects} />
  );
}
