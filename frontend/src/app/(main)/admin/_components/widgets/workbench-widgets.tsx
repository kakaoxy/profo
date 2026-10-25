/**
 * 工作台各 widget 的服务端数据包装（迭代二 SPEC §8.3）
 *
 * 每个 widget 独立取数 + 独立 Suspense：禁止在页面顶层 await 所有数据再分发
 * （会造成请求瀑布，违反总纲 C9）。
 *
 * 取数失败一律**静默降级**（返回 null 让卡片显示空态），不进全局错误横幅——
 * 这样单个 widget 失败不会让整屏不可用；401 的 NEXT_REDIRECT 必须放行。
 */

import { cache } from "react";
import { fetchClient } from "@/lib/api-server";
import { isRedirectError } from "@/lib/auth/server/session";
import { logger } from "@/lib/logger";
import type { components } from "@/lib/api-types";
import { AddProjectCard } from "../add-project-card";
import {
  AlertCard,
  ProjectOverviewCard,
  LeadsFunnelCard,
  DashboardLeadsTable,
  QuickEntrySection,
  ProjectCardList,
} from "..";
import { getDashboardData } from "../../_lib/dashboard-data";
import { GrowthOverviewCard } from "./growth-overview-card";
import { FinanceSummaryCard } from "./finance-summary-card";
import { AuditSummaryCard } from "./audit-summary-card";
import { MyProjectsCard } from "./my-projects-card";
import { MyTodosCard } from "./my-todos-card";
import { TodoBoardSummaryCard } from "./todo-board-summary-card";
import { WidgetHead } from "./widget-head";

type MonthlySummary = components["schemas"]["LedgerMonthlySummaryResponse"];
type AuditSummary = components["schemas"]["OperationLogSummaryResponse"];
type OperationLog = components["schemas"]["OperationLogResponse"];
type TrendResponse = components["schemas"]["TrendResponse"];
type SourceBreakdown = components["schemas"]["SourceBreakdownResponse"];
type GrowthKpi = components["schemas"]["GrowthOverviewKpiResponse"];
type ProjectResponse = components["schemas"]["ProjectResponse"];
type TodoBoard = components["schemas"]["ProjectTodoBoardResponse"];
type Backlog = components["schemas"]["LeadAssessmentBacklogResponse"];

/** 待评估积压（alert_card 扩展：数量 + 最久等待 + 涉及负责人） */
export const getAssessmentBacklog = cache(async (): Promise<Backlog | null> => {
  const client = await fetchClient();
  try {
    const { data } = await client.GET("/api/v1/leads/stats/assessment-backlog", {});
    return data ?? null;
  } catch (e) {
    if (isRedirectError(e)) throw e;
    logger.error("[Workbench] 待评估积压获取失败:", e);
    return null;
  }
});

/** 获客总览三接口并行（kpi / trend / source-breakdown） */
export const getGrowthOverview = cache(
  async (): Promise<{
    kpi: GrowthKpi | null;
    trend: TrendResponse["points"];
    sources: SourceBreakdown["items"];
  }> => {
    const client = await fetchClient();
    const results = await Promise.allSettled([
      client.GET("/api/v1/admin/growth-center/overview/kpi", {}),
      client.GET("/api/v1/admin/growth-center/overview/trend", { params: { query: { days: 14 } } }),
      client.GET("/api/v1/admin/growth-center/overview/source-breakdown", {
        params: { query: { days: 30 } },
      }),
    ]);
    for (const r of results) {
      if (r.status === "rejected" && isRedirectError(r.reason)) throw r.reason;
    }
    const [kpiRes, trendRes, sourceRes] = results;
    if (kpiRes.status === "rejected") logger.error("[Workbench] 获客 KPI 失败:", kpiRes.reason);
    if (trendRes.status === "rejected") logger.error("[Workbench] 获客趋势失败:", trendRes.reason);
    if (sourceRes.status === "rejected")
      logger.error("[Workbench] 获客来源失败:", sourceRes.reason);

    return {
      kpi: kpiRes.status === "fulfilled" ? (kpiRes.value.data ?? null) : null,
      trend: trendRes.status === "fulfilled" ? (trendRes.value.data?.points ?? []) : [],
      sources: sourceRes.status === "fulfilled" ? (sourceRes.value.data?.items ?? []) : [],
    };
  },
);

/** 资金月度概览 */
export const getMonthlySummary = cache(async (): Promise<MonthlySummary | null> => {
  const client = await fetchClient();
  try {
    const { data } = await client.GET("/api/v1/admin/ledger/monthly-summary", {});
    return data ?? null;
  } catch (e) {
    if (isRedirectError(e)) throw e;
    logger.error("[Workbench] 资金月度概览获取失败:", e);
    return null;
  }
});

/** 审计概览 + 最近敏感访问日志（并行） */
export const getAuditOverview = cache(
  async (): Promise<{ summary: AuditSummary | null; sensitiveItems: OperationLog[] }> => {
    const client = await fetchClient();
    const results = await Promise.allSettled([
      client.GET("/api/v1/operation-logs/summary", {}),
      client.GET("/api/v1/operation-logs", {
        params: { query: { page: 1, page_size: 3, action: "sensitive_data_access" } },
      }),
    ]);
    for (const r of results) {
      if (r.status === "rejected" && isRedirectError(r.reason)) throw r.reason;
    }
    const [summaryRes, logsRes] = results;
    return {
      summary: summaryRes.status === "fulfilled" ? (summaryRes.value.data ?? null) : null,
      sensitiveItems: logsRes.status === "fulfilled" ? (logsRes.value.data?.items ?? []) : [],
    };
  },
);

/** 我负责的项目（裸数组） */
export const getMyResponsibleProjects = cache(async (): Promise<ProjectResponse[]> => {
  const client = await fetchClient();
  try {
    const { data } = await client.GET("/api/v1/projects/my-responsible", {});
    return data ?? [];
  } catch (e) {
    if (isRedirectError(e)) throw e;
    logger.error("[Workbench] 我负责的项目获取失败:", e);
    return [];
  }
});

/** 我的待办（scope=mine） */
export const getMyTodos = cache(async (): Promise<TodoBoard | null> => {
  const client = await fetchClient();
  try {
    const { data } = await client.GET("/api/v1/projects/todo-board", {
      params: { query: { scope: "mine" } },
    });
    return data ?? null;
  } catch (e) {
    if (isRedirectError(e)) throw e;
    logger.error("[Workbench] 我的待办获取失败:", e);
    return null;
  }
});

/**
 * 全量项目待办看板（默认 scope=all）。
 *
 * `todo_board_summary` 卡用它的 summary + 首条事项。无 project:read 时后端 403
 * 属预期场景 → 返回 null 由卡片渲染「—」，不进全局错误横幅。
 */
export const getFullTodoBoard = cache(async (): Promise<TodoBoard | null> => {
  const client = await fetchClient();
  try {
    const { data } = await client.GET("/api/v1/projects/todo-board", {});
    return data ?? null;
  } catch (e) {
    if (isRedirectError(e)) throw e;
    logger.error("[Workbench] 项目待办看板获取失败:", e);
    return null;
  }
});

// ==================== 渲染包装（每个对应一个 Suspense 边界） ====================

export async function ProjectOverviewWidget() {
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

export async function LeadsFunnelWidget() {
  const { funnelData } = await getDashboardData();
  return <LeadsFunnelCard funnelData={funnelData} />;
}

export async function AlertCardWidget() {
  const backlog = await getAssessmentBacklog();
  if (!backlog) return null;
  return (
    <AlertCard
      count={backlog.pending_count}
      oldestWaitDays={backlog.oldest_wait_days}
      oldestWaitHours={backlog.oldest_wait_hours}
      ownerCount={backlog.owner_count}
    />
  );
}

export async function TodoBoardSummaryWidget() {
  const board = await getFullTodoBoard();
  return <TodoBoardSummaryCard board={board} />;
}

export async function GrowthOverviewWidget() {
  const { kpi, trend, sources } = await getGrowthOverview();
  return <GrowthOverviewCard kpi={kpi} trend={trend} sources={sources} />;
}

export async function FinanceSummaryWidget() {
  const summary = await getMonthlySummary();
  return <FinanceSummaryCard summary={summary} />;
}

export async function AuditSummaryWidget() {
  const { summary, sensitiveItems } = await getAuditOverview();
  return <AuditSummaryCard summary={summary} sensitiveItems={sensitiveItems} />;
}

export async function MonitorProjectsWidget() {
  const { projects, marketDataMap } = await getDashboardData();
  // 设计稿屏 01：monitor_projects 是**一张卡**（WGHead + 5 列等宽网格 + 末尾「添加新项目」
  // 虚线卡）。旧版 MonitorSection 的 h2 与禁用筛选/排序按钮属于 v0 单套布局的
  // 页面级结构，卡片化后由 WGHead 样式的卡头 + 「全部项目」链接承载。
  return (
    <div
      role="region"
      aria-label="重点监控项目"
      className="flex min-w-0 flex-1 flex-col rounded-cards bg-white px-[22px] py-5 shadow-steep-sm"
    >
      <WidgetHead
        title="重点监控项目"
        sub={`${projects.length} 个在跟`}
        link="全部项目"
        href="/admin/projects"
      />
      {/* data-monitor-grid = 设计稿 .monitor-row.as-grid（5 列等宽网格）的 DOM 契约 */}
      <div
        data-monitor-grid=""
        className="mt-3.5 grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5"
      >
        <ProjectCardList projects={projects} marketDataMap={marketDataMap} layout="grid" />
        <AddProjectCard layout="grid" />
      </div>
    </div>
  );
}

export async function LeadsTableWidget() {
  const { leads } = await getDashboardData();
  return <DashboardLeadsTable leads={leads} />;
}

export async function QuickEntryWidget() {
  const [monthly, board] = await Promise.all([getMonthlySummary(), getFullTodoBoard()]);
  return (
    <QuickEntrySection
      monthRecordCount={monthly?.month_record_count}
      todoSummary={board?.summary ?? null}
    />
  );
}

export async function MyProjectsWidget() {
  const projects = await getMyResponsibleProjects();
  return <MyProjectsCard projects={projects} />;
}

export async function MyTodosWidget() {
  const board = await getMyTodos();
  return <MyTodosCard board={board} />;
}

/** key → 服务端组件（未知 key 由调用方跳过） */
export const WIDGET_COMPONENTS: Record<string, () => Promise<React.ReactElement | null>> = {
  project_overview: ProjectOverviewWidget,
  leads_funnel: LeadsFunnelWidget,
  alert_card: AlertCardWidget,
  todo_board_summary: TodoBoardSummaryWidget,
  growth_overview: GrowthOverviewWidget,
  finance_summary: FinanceSummaryWidget,
  audit_summary: AuditSummaryWidget,
  monitor_projects: MonitorProjectsWidget,
  leads_table: LeadsTableWidget,
  quick_entry: QuickEntryWidget,
  my_projects: MyProjectsWidget,
  my_todos: MyTodosWidget,
};
