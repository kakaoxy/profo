import { Skeleton } from "@/components/ui/skeleton";

/**
 * 活动配置页路由级加载态（Server Component 取数期间展示）。
 * 骨架结构对齐设计稿 Screen 4：页头 + 类型 Tab + KPI 概览 + 活动列表卡。
 */
export default function GrowthCampaignsLoading() {
  return (
    <div className="min-h-screen bg-fog">
      <div className="w-full max-w-300 mx-auto flex flex-col gap-6 py-8 px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-5">
          <div className="flex flex-col gap-1.5">
            <Skeleton className="h-7 w-24" />
            <Skeleton className="h-4 w-96 max-w-full" />
          </div>
          <Skeleton className="h-9 w-28 rounded-full" />
        </div>

        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[38px] w-28 rounded-full" />
          ))}
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-cards" />
          ))}
        </div>

        <Skeleton className="h-96 rounded-cards" />
      </div>
    </div>
  );
}
