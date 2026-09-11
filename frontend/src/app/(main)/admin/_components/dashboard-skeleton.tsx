/**
 * 工作台页面骨架屏组件
 * 用于 Suspense fallback
 */

export function DashboardHeaderSkeleton() {
  return (
    <div className="mb-8 flex items-center gap-3 motion-safe:animate-pulse">
      <div className="p-2 bg-white rounded-inputs">
        <div className="w-6 h-6 bg-fog rounded" />
      </div>
      <div>
        <div className="h-7 w-24 bg-fog rounded" />
        <div className="h-4 w-48 bg-fog rounded mt-1" />
      </div>
    </div>
  );
}

export function ProjectOverviewCardSkeleton() {
  return (
    <div className="col-span-12 lg:col-span-5 motion-safe:animate-pulse">
      <div className="h-[180px] bg-white rounded-cards p-5">
        <div className="h-5 w-24 bg-fog rounded mb-4" />
        <div className="grid grid-cols-2 gap-4">
          <div className="h-16 bg-fog rounded-inputs" />
          <div className="h-16 bg-fog rounded-inputs" />
          <div className="h-16 bg-fog rounded-inputs" />
          <div className="h-16 bg-fog rounded-inputs" />
        </div>
      </div>
    </div>
  );
}

export function LeadsFunnelCardSkeleton() {
  return (
    <div className="col-span-12 md:col-span-4 lg:col-span-4 motion-safe:animate-pulse">
      <div className="h-[180px] bg-white rounded-cards p-5">
        <div className="h-5 w-20 bg-fog rounded mb-4" />
        <div className="flex items-end justify-around h-[100px]">
          <div className="w-8 h-full bg-fog rounded-t" />
          <div className="w-8 h-3/4 bg-fog rounded-t" />
          <div className="w-8 h-1/2 bg-fog rounded-t" />
          <div className="w-8 h-1/4 bg-fog rounded-t" />
        </div>
      </div>
    </div>
  );
}

export function AlertCardSkeleton() {
  return (
    <div className="col-span-12 md:col-span-4 lg:col-span-3 motion-safe:animate-pulse">
      <div className="h-[180px] bg-white rounded-cards p-5">
        <div className="h-5 w-20 bg-fog rounded mb-4" />
        <div className="flex items-center justify-center h-[100px]">
          <div className="w-16 h-16 bg-fog rounded-full" />
        </div>
      </div>
    </div>
  );
}

export function ProjectCardSkeleton() {
  return (
    <div className="w-full sm:w-[280px] sm:shrink-0 bg-white rounded-cards overflow-hidden motion-safe:animate-pulse">
      <div className="p-4 border-b border-fog bg-fog">
        <div className="flex justify-between items-start mb-1">
          <div className="h-4 w-16 bg-fog rounded" />
          <div className="w-4 h-4 bg-fog rounded" />
        </div>
        <div className="h-6 w-32 bg-fog rounded mb-1" />
        <div className="h-3 w-40 bg-fog rounded mt-1" />
        <div className="h-3 w-24 bg-fog rounded mt-0.5" />
      </div>
      <div className="p-4 space-y-4">
        <div className="h-3 w-16 bg-fog rounded mb-3" />
        <div className="h-12 bg-fog rounded" />
        <div className="border-t border-dashed border-fog py-2" />
        <div className="h-3 w-16 bg-fog rounded mb-3" />
        <div className="h-12 bg-fog rounded" />
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
    <div className="motion-safe:animate-pulse">
      <div className="h-6 w-32 bg-fog rounded mb-4" />
      <div className="bg-white rounded-cards overflow-hidden">
        <div className="h-12 bg-fog border-b border-fog" />
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-14 border-b border-fog last:border-0">
            <div className="flex items-center gap-4 px-4 h-full">
              <div className="h-4 w-24 bg-fog rounded" />
              <div className="h-4 w-20 bg-fog rounded" />
              <div className="h-4 w-16 bg-fog rounded" />
              <div className="h-4 w-20 bg-fog rounded" />
              <div className="h-4 w-24 bg-fog rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function QuickEntrySkeleton() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {[0, 1].map((i) => (
        <div key={i} className="bg-white rounded-cards p-3 motion-safe:animate-pulse">
          <div className="flex items-center gap-2 mb-3">
            <div className="h-8 w-8 rounded-inputs bg-fog" />
            <div className="h-4 w-24 bg-fog rounded" />
          </div>
          <div className="space-y-2">
            {[0, 1, 2].map((j) => (
              <div
                key={j}
                className="flex items-center justify-between min-h-[56px] p-3 border-b border-fog last:border-b-0"
              >
                <div className="space-y-1">
                  <div className="h-3 w-32 bg-fog rounded" />
                  <div className="h-2 w-20 bg-fog rounded" />
                </div>
                <div className="h-5 w-12 bg-fog rounded" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
