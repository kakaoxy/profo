import { Skeleton } from "@/components/ui/skeleton";

/**
 * 线索列表页路由级加载态（Server Component 取数期间展示）。
 * 骨架结构对齐设计稿：页头 + KPI 概览 + 筛选工具栏 + 线索明细卡。
 */
export default function RecruitLeadsLoading() {
  return (
    <div className="min-h-screen bg-fog">
      <div className="w-full max-w-300 mx-auto flex flex-col gap-6 py-8 px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-5">
          <div className="flex flex-col gap-1.5">
            <Skeleton className="h-7 w-32" />
            <Skeleton className="h-4 w-96 max-w-full" />
          </div>
          <Skeleton className="h-5 w-20" />
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-cards" />
          ))}
        </div>

        <Skeleton className="h-10 w-full max-w-full" />

        <Skeleton className="h-96 rounded-cards" />
      </div>
    </div>
  );
}
