import { Skeleton } from "@/components/ui/skeleton";

/**
 * 漏斗看板页路由级加载态（Server Component 取数期间展示）。
 * 骨架结构对齐设计稿：页头 + 漏斗主卡 + 员工维度表。
 */
export default function RecruitFunnelLoading() {
  return (
    <div className="min-h-screen bg-fog">
      <div className="w-full max-w-300 mx-auto flex flex-col gap-6 py-8 px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-5">
          <div className="flex flex-col gap-1.5">
            <Skeleton className="h-7 w-24" />
            <Skeleton className="h-4 w-96 max-w-full" />
          </div>
          <Skeleton className="h-10 w-full max-w-full xl:w-96" />
        </div>

        <div className="bg-white rounded-cards shadow-steep p-6">
          <Skeleton className="h-5 w-48 mb-4" />
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-10.5 rounded-[14px] mb-3" />
          ))}
        </div>

        <Skeleton className="h-64 rounded-cards" />
      </div>
    </div>
  );
}
