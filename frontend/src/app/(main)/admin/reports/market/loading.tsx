/**
 * 商圈分析报表页加载骨架（Server Component）。
 *
 * 结构与 page.tsx 一致：筛选栏 / KPI / 图表 / 表格 4 段骨架。
 */
import { Skeleton } from "@/components/ui/skeleton";

export default function MarketReportsLoading() {
  return (
    <div className="min-h-screen bg-muted">
      <div className="w-full max-w-400 mx-auto flex flex-col gap-6 py-6 px-4 sm:px-6 lg:px-8">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-80 w-full" />
        <Skeleton className="h-60 w-full" />
      </div>
    </div>
  );
}
