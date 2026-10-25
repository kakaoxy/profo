import { Suspense } from "react";
import { Plus, Filter, SortAsc } from "lucide-react";
import {
  ProjectOverviewCardSkeleton,
  LeadsFunnelCardSkeleton,
  AlertCardSkeleton,
  TodoBoardSummaryCardSkeleton,
  ProjectCardListSkeleton,
  DashboardLeadsTableSkeleton,
  QuickEntrySkeleton,
  DashboardErrorWrapper,
  DashboardOverviewWrapper,
  DashboardFunnelWrapper,
  DashboardAlertWrapper,
  DashboardTodoBoardWrapper,
  DashboardProjectsWrapper,
  DashboardLeadsWrapper,
  DashboardQuickEntryWrapper,
  PageContainer,
  PageHeader,
} from "./_components";
import { AddProjectCard } from "./_components/add-project-card";
import { HasPermission } from "@/components/has-permission";
import { PERMISSION_CODES } from "@/lib/auth/permissions";
import { getWidget, resolveSpans, spanToClassName } from "@/lib/workbench-widgets";
import { getWorkbenchLayout } from "./_lib/workbench-config";
import { WorkbenchCustomizer } from "./_components/workbench-customizer";
import { WIDGET_COMPONENTS } from "./_components/widgets/workbench-widgets";

// 页面元数据
export const metadata = {
  title: "工作台 - ProFo",
};

// 头部组件（静态部分）
function DashboardHeader() {
  return (
    <PageHeader title="工作台" description="欢迎回来，这是您今日的数据概览" className="mb-8" />
  );
}

// 项目监控区域骨架屏
function MonitorSectionSkeleton() {
  return (
    <section className="mb-8 overflow-hidden">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-[21px] font-medium text-ink tracking-[-0.01em]">重点监控项目</h2>
        <div className="flex gap-2">
          <button
            disabled
            aria-label="筛选功能开发中"
            className="p-2 rounded-xl bg-white shadow-steep-sm text-graphite cursor-not-allowed opacity-60"
          >
            <Filter className="w-4 h-4" aria-hidden="true" />
          </button>
          <button
            disabled
            aria-label="排序功能开发中"
            className="p-2 rounded-xl bg-white shadow-steep-sm text-graphite cursor-not-allowed opacity-60"
          >
            <SortAsc className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      </div>
      <div className="flex flex-col sm:flex-row gap-4 sm:overflow-x-auto pb-4 pt-2 sm:custom-scrollbar min-w-0">
        <ProjectCardListSkeleton />
        {/* 添加项目卡片占位 */}
        <div className="w-full sm:w-70 sm:shrink-0 bg-fog rounded-cards border-2 border-dashed border-dove/40 flex flex-col items-center justify-center p-6 text-center min-h-100">
          <div className="w-14 h-14 rounded-full bg-white shadow-steep-sm flex items-center justify-center text-graphite mb-4 transition-colors">
            <Plus className="w-6 h-6" aria-hidden="true" />
          </div>
          <p className="text-base font-medium text-ink">添加新项目</p>
          <p className="text-xs text-graphite mt-1.5 max-w-35">快速录入房源或新建开发项目</p>
        </div>
      </div>
    </section>
  );
}

// 项目监控区域组件
function MonitorSection() {
  return (
    <section className="mb-8 overflow-hidden" aria-labelledby="monitor-section-title">
      <div className="flex items-center justify-between mb-6">
        <h2
          id="monitor-section-title"
          className="text-[21px] font-medium text-ink tracking-[-0.01em]"
        >
          重点监控项目
        </h2>
        <div className="flex gap-2">
          <button
            disabled
            className="p-2 rounded-xl bg-white shadow-steep-sm text-graphite cursor-not-allowed opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            title="筛选功能开发中"
            aria-label="筛选功能开发中"
          >
            <Filter className="w-4 h-4" aria-hidden="true" />
          </button>
          <button
            disabled
            className="p-2 rounded-xl bg-white shadow-steep-sm text-graphite cursor-not-allowed opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            title="排序功能开发中"
            aria-label="排序功能开发中"
          >
            <SortAsc className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 sm:overflow-x-auto pb-4 pt-2 sm:custom-scrollbar min-w-0">
        <Suspense fallback={<ProjectCardListSkeleton />}>
          <DashboardProjectsWrapper />
        </Suspense>

        <AddProjectCard />
      </div>
    </section>
  );
}

/**
 * 旧版单套仪表盘（v0 布局）。
 *
 * 保留一个 release 作为回退路径：`WORKBENCH_LAYOUT_ENABLED=false` 或布局取数失败时
 * 渲染本组件（SPEC 风险与回滚 §12；验收 A12）。
 */
export function LegacyDashboard() {
  return (
    <main id="dashboard-main" className="min-h-screen bg-fog min-w-0 overflow-x-hidden scroll-mt-4">
      {/* Skip link for keyboard / AT users */}
      <a
        href="#dashboard-main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:px-3 focus:py-2 focus:rounded-inputs focus:bg-primary focus:text-primary-foreground focus:shadow-lg"
      >
        跳到主内容
      </a>

      <PageContainer>
        {/* Header - 静态部分 */}
        <DashboardHeader />

        {/* Top Row - Three Column Layout（v0 版式：5/4/3 + 满宽统计条） */}
        <div className="grid grid-cols-12 gap-4 lg:gap-6 mb-8 min-w-0">
          <Suspense fallback={null}>
            <DashboardErrorWrapper />
          </Suspense>
          {/* 卡片已去掉自带 col-span（改由工作台栅格控宽），v0 版式在此补回 */}
          <HasPermission code={PERMISSION_CODES.PROJECT_READ}>
            <div className="col-span-12 flex min-w-0 lg:col-span-5">
              <Suspense fallback={<ProjectOverviewCardSkeleton />}>
                <DashboardOverviewWrapper />
              </Suspense>
            </div>
          </HasPermission>
          <HasPermission code={PERMISSION_CODES.LEAD_READ}>
            <div className="col-span-12 flex min-w-0 md:col-span-4">
              <Suspense fallback={<LeadsFunnelCardSkeleton />}>
                <DashboardFunnelWrapper />
              </Suspense>
            </div>
          </HasPermission>
          <HasPermission code={PERMISSION_CODES.LEAD_WRITE}>
            <div className="col-span-12 flex min-w-0 md:col-span-4 lg:col-span-3">
              <Suspense fallback={<AlertCardSkeleton />}>
                <DashboardAlertWrapper />
              </Suspense>
            </div>
          </HasPermission>
          <HasPermission code={PERMISSION_CODES.PROJECT_READ}>
            <div className="col-span-12 min-w-0">
              <Suspense fallback={<TodoBoardSummaryCardSkeleton />}>
                <DashboardTodoBoardWrapper />
              </Suspense>
            </div>
          </HasPermission>
        </div>

        {/* Quick Entry Section */}
        <div className="mb-8">
          <Suspense fallback={<QuickEntrySkeleton />}>
            <DashboardQuickEntryWrapper />
          </Suspense>
        </div>

        {/* Monitor Projects Section */}
        <HasPermission code={PERMISSION_CODES.PROJECT_READ}>
          <Suspense fallback={<MonitorSectionSkeleton />}>
            <MonitorSection />
          </Suspense>
        </HasPermission>

        {/* Leads Table Section */}
        <HasPermission code={PERMISSION_CODES.LEAD_READ}>
          <Suspense fallback={<DashboardLeadsTableSkeleton />}>
            <DashboardLeadsWrapper />
          </Suspense>
        </HasPermission>
      </PageContainer>
    </main>
  );
}

/**
 * 角色化工作台（迭代二 SPEC §8.3）。
 *
 * 渲染链路：读生效布局（后端已做三级 fallback + 权限过滤）→ 按 order 排序 →
 * 每个 widget **独立 Suspense** 并行取数（禁止顶层串行 await，C9）→
 * 6 栏孤儿卡渲染期升满宽（设计稿补充口径 a）。
 *
 * 回退：后端 `WORKBENCH_LAYOUT_ENABLED=false` 时布局接口返回 404，
 * getWorkbenchLayout 视为降级 → LegacyDashboard（验收 A12）。
 * 开关**只有后端一个事实源**，前端不设平行变量以免两处漂移。
 */
export default async function DashboardPage() {
  const { layout, error } = await getWorkbenchLayout();
  if (!layout || error) {
    return <LegacyDashboard />;
  }

  const enabledKeys = layout.widgets.filter((w) => w.enabled).map((w) => w.key);
  const spanMap = resolveSpans(enabledKeys);
  const total = layout.widgets.length;
  const sourceLabel =
    layout.source === "user" ? "个人覆盖" : layout.source === "role" ? "角色默认" : "代码兜底";

  return (
    <main id="dashboard-main" className="min-h-screen bg-fog min-w-0 overflow-x-hidden scroll-mt-4">
      <a
        href="#dashboard-main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:px-3 focus:py-2 focus:rounded-inputs focus:bg-primary focus:text-primary-foreground focus:shadow-lg"
      >
        跳到主内容
      </a>

      <PageContainer>
        {/* 页头（设计稿 .page-head：h1 Signifier 44px + 副标题 15px，mb 26px） */}
        <div className="mb-[26px] flex flex-wrap items-end justify-between gap-6">
          <PageHeader
            title="工作台"
            description="欢迎回来，这是您今日的数据概览"
            className="mb-0"
          />
          {/* 定制入口：user 角色不渲染（D-07；后端同样对 user 返回 403） */}
          <HasPermission code={PERMISSION_CODES.PROJECT_READ}>
            <WorkbenchCustomizer widgets={layout.widgets} />
          </HasPermission>
        </div>

        {/* 工具栏（设计稿 .toolbar：当前生效 N / M + 来源徽章，mb 16px） */}
        <div className="mb-4 flex flex-wrap items-center gap-2 text-[12.5px] text-graphite">
          <span>
            当前生效 <b className="font-[480] text-ink">{enabledKeys.length}</b> / {total} 个 widget
          </span>
          <span className="text-dove">·</span>
          <span>来源</span>
          <span className="rounded-pill bg-white px-[9px] py-[2px] text-[11.5px] text-graphite shadow-steep-sm">
            {sourceLabel}
          </span>
        </div>

        {enabledKeys.length === 0 ? (
          <div className="rounded-cards bg-white px-6 py-14 text-center shadow-steep-sm">
            <p className="text-[15px] font-medium text-ink">所有卡片已隐藏</p>
            <p className="mt-2 text-[13px] text-graphite">
              点「定制」重新打开，或点「重置」恢复默认布局
            </p>
          </div>
        ) : (
          // 12 栏栅格：设计稿 .wb-grid = gap 18px + align-items stretch（同行卡片等高）
          <div className="grid grid-cols-12 items-stretch gap-[18px] min-w-0">
            {enabledKeys.map((key) => {
              const meta = getWidget(key);
              const Widget = WIDGET_COMPONENTS[key];
              if (!meta || !Widget) return null;
              const span = spanMap.get(key) ?? meta.span;
              return (
                // data-widget = 注册表 key：widget 身份的 DOM 契约（E2E 据此断言
                // 「admin 见 finance_summary，operator/user 不见」）。各卡片自身的
                // role="region"/aria-label 中文措辞不一，不在此统一（避免与
                // LegacyDashboard 复用冲突、也避免嵌套重复 landmark）。
                // flex：让卡片在栅格单元内撑满高度（设计稿 .wb 为 flex column）。
                <div
                  key={key}
                  data-widget={key}
                  className={`${spanToClassName(span)} flex min-w-0`}
                >
                  <Suspense fallback={<WidgetSkeleton />}>
                    <Widget />
                  </Suspense>
                </div>
              );
            })}
          </div>
        )}
      </PageContainer>
    </main>
  );
}

/** 单个 widget 的加载骨架（统一高度，避免布局跳动） */
function WidgetSkeleton() {
  return (
    <div
      className="h-[168px] animate-pulse rounded-cards bg-white p-5 shadow-steep-sm"
      role="status"
      aria-label="加载中"
    >
      <div className="h-3 w-20 rounded bg-fog" />
      <div className="mt-4 flex gap-3">
        <div className="flex-1">
          <div className="h-2 w-3/5 rounded bg-fog" />
          <div className="mt-2 h-5 w-4/5 rounded bg-fog" />
        </div>
        <div className="flex-1">
          <div className="h-2 w-3/5 rounded bg-fog" />
          <div className="mt-2 h-5 w-3/5 rounded bg-fog" />
        </div>
      </div>
    </div>
  );
}
