/**
 * 工作台页面骨架屏组件
 * 用于 Suspense fallback
 */

export function DashboardHeaderSkeleton() {
  return (
    <div className="mb-8 flex items-center gap-3 animate-pulse">
      <div className="p-2 bg-white dark:bg-slate-800 rounded-lg shadow-sm">
        <div className="w-6 h-6 bg-slate-200 dark:bg-slate-700 rounded" />
      </div>
      <div>
        <div className="h-7 w-24 bg-slate-200 dark:bg-slate-700 rounded" />
        <div className="h-4 w-48 bg-slate-200 dark:bg-slate-700 rounded mt-1" />
      </div>
    </div>
  );
}

export function ProjectOverviewCardSkeleton() {
  return (
    <div className="col-span-12 lg:col-span-5 animate-pulse">
      <div className="h-[180px] bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
        <div className="h-5 w-24 bg-slate-200 dark:bg-slate-700 rounded mb-4" />
        <div className="grid grid-cols-2 gap-4">
          <div className="h-16 bg-slate-100 dark:bg-slate-700/50 rounded-lg" />
          <div className="h-16 bg-slate-100 dark:bg-slate-700/50 rounded-lg" />
          <div className="h-16 bg-slate-100 dark:bg-slate-700/50 rounded-lg" />
          <div className="h-16 bg-slate-100 dark:bg-slate-700/50 rounded-lg" />
        </div>
      </div>
    </div>
  );
}

export function LeadsFunnelCardSkeleton() {
  return (
    <div className="col-span-12 md:col-span-4 lg:col-span-4 animate-pulse">
      <div className="h-[180px] bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
        <div className="h-5 w-20 bg-slate-200 dark:bg-slate-700 rounded mb-4" />
        <div className="flex items-end justify-around h-[100px]">
          <div className="w-8 h-full bg-slate-200 dark:bg-slate-700 rounded-t" />
          <div className="w-8 h-3/4 bg-slate-200 dark:bg-slate-700 rounded-t" />
          <div className="w-8 h-1/2 bg-slate-200 dark:bg-slate-700 rounded-t" />
          <div className="w-8 h-1/4 bg-slate-200 dark:bg-slate-700 rounded-t" />
        </div>
      </div>
    </div>
  );
}

export function AlertCardSkeleton() {
  return (
    <div className="col-span-12 md:col-span-4 lg:col-span-3 animate-pulse">
      <div className="h-[180px] bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
        <div className="h-5 w-20 bg-slate-200 dark:bg-slate-700 rounded mb-4" />
        <div className="flex items-center justify-center h-[100px]">
          <div className="w-16 h-16 bg-slate-200 dark:bg-slate-700 rounded-full" />
        </div>
      </div>
    </div>
  );
}

export function ProjectCardSkeleton() {
  return (
    <div className="w-[280px] shrink-0 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden animate-pulse">
      <div className="p-4 border-b border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50">
        <div className="flex justify-between items-start mb-1">
          <div className="h-4 w-16 bg-slate-200 dark:bg-slate-700 rounded" />
          <div className="w-4 h-4 bg-slate-200 dark:bg-slate-700 rounded" />
        </div>
        <div className="h-6 w-32 bg-slate-200 dark:bg-slate-700 rounded mb-1" />
        <div className="h-3 w-40 bg-slate-200 dark:bg-slate-700 rounded mt-1" />
        <div className="h-3 w-24 bg-slate-200 dark:bg-slate-700 rounded mt-0.5" />
      </div>
      <div className="p-4 space-y-4">
        <div className="h-3 w-16 bg-slate-200 dark:bg-slate-700 rounded mb-3" />
        <div className="h-12 bg-slate-100 dark:bg-slate-700/50 rounded" />
        <div className="border-t border-dashed border-slate-200 dark:border-slate-700 py-2" />
        <div className="h-3 w-16 bg-slate-200 dark:bg-slate-700 rounded mb-3" />
        <div className="h-12 bg-slate-100 dark:bg-slate-700/50 rounded" />
      </div>
    </div>
  );
}

export function ProjectCardListSkeleton() {
  return (
    <>
      <ProjectCardSkeleton />
      <ProjectCardSkeleton />
      <ProjectCardSkeleton />
    </>
  );
}

export function DashboardLeadsTableSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="h-6 w-32 bg-slate-200 dark:bg-slate-700 rounded mb-4" />
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="h-12 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700" />
        {[...Array(5)].map((_, i) => (
          <div
            key={i}
            className="h-14 border-b border-slate-100 dark:border-slate-700/50 last:border-0"
          >
            <div className="flex items-center gap-4 px-4 h-full">
              <div className="h-4 w-24 bg-slate-200 dark:bg-slate-700 rounded" />
              <div className="h-4 w-20 bg-slate-200 dark:bg-slate-700 rounded" />
              <div className="h-4 w-16 bg-slate-200 dark:bg-slate-700 rounded" />
              <div className="h-4 w-20 bg-slate-200 dark:bg-slate-700 rounded" />
              <div className="h-4 w-24 bg-slate-200 dark:bg-slate-700 rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
