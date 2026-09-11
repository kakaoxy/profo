/**
 * 商圈分析报表页加载骨架（Server Component）。
 *
 * 结构与 page.tsx 一致：筛选栏 / KPI / 图表 / 表格 4 段骨架。
 */
import { Skeleton } from "@/components/ui/skeleton";
import { PageContainer } from "@/app/(main)/admin/_components";

export default function MarketReportsLoading() {
  return (
    <div className="min-h-screen bg-fog">
      <PageContainer className="flex flex-col gap-6">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-80 w-full" />
        <Skeleton className="h-60 w-full" />
      </PageContainer>
    </div>
  );
}
