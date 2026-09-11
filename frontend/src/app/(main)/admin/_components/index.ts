// 设计与布局基元（后台统一 Steep 体系，唯一事实来源）
export { PageContainer, type PageContainerProps } from "./page-container";
export { PageHeader, type PageHeaderProps } from "./page-header";
export {
  StatCardGrid,
  type StatCardGridProps,
  type StatItem,
  type StatTrend,
} from "./stat-card-grid";

export { ProjectCardList } from "./project-card-list";
export { ProjectOverviewCard } from "./project-overview-card";
export { LeadsFunnelCard } from "./leads-funnel-card";
export { AlertCard } from "./alert-card";
export { DashboardLeadsTable } from "./dashboard-leads-table";
export { QuickEntrySection } from "./quick-entry-section";

// Suspense 骨架屏
export {
  DashboardHeaderSkeleton,
  ProjectOverviewCardSkeleton,
  LeadsFunnelCardSkeleton,
  AlertCardSkeleton,
  ProjectCardListSkeleton,
  DashboardLeadsTableSkeleton,
  QuickEntrySkeleton,
} from "./dashboard-skeleton";

// 数据包装组件（配合 Suspense）
export {
  DashboardErrorWrapper,
  DashboardOverviewWrapper,
  DashboardFunnelWrapper,
  DashboardAlertWrapper,
  DashboardProjectsWrapper,
  DashboardLeadsWrapper,
  DashboardQuickEntryWrapper,
} from "./dashboard-data-wrapper";
