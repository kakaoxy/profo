import { Suspense } from "react";
import { Plus, Filter, SortAsc } from "lucide-react";
import {
  ProjectOverviewCardSkeleton,
  LeadsFunnelCardSkeleton,
  AlertCardSkeleton,
  ProjectCardListSkeleton,
  DashboardLeadsTableSkeleton,
  QuickEntrySkeleton,
  DashboardErrorWrapper,
  DashboardOverviewWrapper,
  DashboardFunnelWrapper,
  DashboardAlertWrapper,
  DashboardProjectsWrapper,
  DashboardLeadsWrapper,
  DashboardQuickEntryWrapper,
  PageContainer,
  PageHeader,
} from "./_components";
import { CreateProjectDialog } from "./projects/_components/create-project";
import { HasPermission } from "@/components/has-permission";
import { PERMISSION_CODES } from "@/lib/auth/permissions";

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
        <h2 className="text-[22px] font-medium text-ink">重点监控项目</h2>
        <div className="flex gap-2">
          <button
            disabled
            aria-label="筛选功能开发中"
            className="p-2 rounded-inputs bg-white border border-dove/40 text-graphite cursor-not-allowed opacity-60"
          >
            <Filter className="w-4 h-4" aria-hidden="true" />
          </button>
          <button
            disabled
            aria-label="排序功能开发中"
            className="p-2 rounded-inputs bg-white border border-dove/40 text-graphite cursor-not-allowed opacity-60"
          >
            <SortAsc className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      </div>
      <div className="flex flex-col sm:flex-row gap-4 sm:overflow-x-auto pb-4 pt-2 sm:custom-scrollbar min-w-0">
        <ProjectCardListSkeleton />
        {/* 添加项目卡片占位 */}
        <div className="w-full sm:w-70 sm:shrink-0 bg-fog rounded-cards border-2 border-dashed border-dove/40 flex flex-col items-center justify-center p-6 text-center min-h-100">
          <div className="w-14 h-14 rounded-full bg-white flex items-center justify-center text-graphite mb-5">
            <Plus className="w-8 h-8" aria-hidden="true" />
          </div>
          <p className="text-lg font-bold text-graphite">添加新项目</p>
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
        <h2 id="monitor-section-title" className="text-[22px] font-medium text-ink">
          重点监控项目
        </h2>
        <div className="flex gap-2">
          <button
            disabled
            className="p-2 rounded-inputs bg-white border border-dove/40 text-graphite cursor-not-allowed opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            title="筛选功能开发中"
            aria-label="筛选功能开发中"
          >
            <Filter className="w-4 h-4" aria-hidden="true" />
          </button>
          <button
            disabled
            className="p-2 rounded-inputs bg-white border border-dove/40 text-graphite cursor-not-allowed opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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

        <CreateProjectDialog
          trigger={
            <div className="w-full sm:w-70 sm:shrink-0 bg-fog rounded-cards border-2 border-dashed border-dove/40 flex flex-col items-center justify-center p-6 text-center group cursor-pointer hover:bg-white hover:border-dove transition-[background-color,border-color] min-h-100">
              <div className="w-14 h-14 rounded-full bg-white flex items-center justify-center text-graphite mb-5 group-hover:bg-ink group-hover:text-white transition-colors">
                <Plus className="w-8 h-8" aria-hidden="true" />
              </div>
              <p className="text-lg font-bold text-graphite group-hover:text-ink transition-colors">
                添加新项目
              </p>
              <p className="text-xs text-graphite mt-2 max-w-35">快速录入房源或新建开发项目</p>
            </div>
          }
        />
      </div>
    </section>
  );
}

export default function DashboardPage() {
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

        {/* Top Row - Three Column Layout */}
        <div className="grid grid-cols-12 gap-4 lg:gap-6 mb-8 min-w-0">
          <Suspense fallback={null}>
            <DashboardErrorWrapper />
          </Suspense>
          <HasPermission code={PERMISSION_CODES.PROJECT_READ}>
            <Suspense fallback={<ProjectOverviewCardSkeleton />}>
              <DashboardOverviewWrapper />
            </Suspense>
          </HasPermission>
          <HasPermission code={PERMISSION_CODES.LEAD_READ}>
            <Suspense fallback={<LeadsFunnelCardSkeleton />}>
              <DashboardFunnelWrapper />
            </Suspense>
          </HasPermission>
          <HasPermission code={PERMISSION_CODES.LEAD_WRITE}>
            <Suspense fallback={<AlertCardSkeleton />}>
              <DashboardAlertWrapper />
            </Suspense>
          </HasPermission>
        </div>

        {/* Quick Entry Section */}
        <Suspense fallback={<QuickEntrySkeleton />}>
          <DashboardQuickEntryWrapper />
        </Suspense>

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
