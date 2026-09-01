import { Skeleton } from "@/components/ui/skeleton";

/**
 * 获客总览页路由级加载态（Server Component 取数期间展示）。
 * 骨架结构对齐设计稿 Screen 1：页头 + KPI + 两列卡 + 漏斗对比卡 + TOP 榜卡。
 */
export default function GrowthOverviewLoading() {
  return (
    <div className="min-h-screen bg-fog">
      <div className="w-full max-w-300 mx-auto flex flex-col gap-6 py-8 px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-5">
          <div className="flex flex-col gap-1.5">
            <Skeleton className="h-7 w-40" />
            <Skeleton className="h-4 w-72 max-w-full" />
          </div>
          <Skeleton className="h-9 w-24 rounded-[12px]" />
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-cards" />
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-64 rounded-cards" />
          <Skeleton className="h-64 rounded-cards" />
        </div>

        <Skeleton className="h-72 rounded-cards" />

        <Skeleton className="h-72 rounded-cards" />
      </div>
    </div>
  );
}
