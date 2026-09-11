import { Skeleton } from "@/components/ui/skeleton";
import { PageContainer } from "@/app/(main)/admin/_components";

export default function MarketingProjectsLoading() {
  return (
    <div className="min-h-screen bg-fog">
      <PageContainer className="flex flex-col gap-8">
        {/* Header Skeleton */}
        <div className="flex flex-col gap-1">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="mt-2 h-4 w-64" />
        </div>

        {/* Stats Skeleton */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-cards bg-white px-6 py-5 shadow-steep">
              <Skeleton className="mb-2 h-4 w-16" />
              <Skeleton className="h-8 w-12" />
            </div>
          ))}
        </div>

        {/* Toolbar Skeleton */}
        <div className="flex flex-col items-start justify-between gap-4 lg:flex-row lg:items-center">
          <div className="flex w-full flex-col items-center gap-3 sm:flex-row lg:w-auto">
            <Skeleton className="h-10 w-72" />
            <Skeleton className="h-10 w-48" />
            <Skeleton className="h-10 w-64" />
          </div>
          <div className="flex w-full gap-3 lg:w-auto">
            <Skeleton className="h-10 w-24" />
            <Skeleton className="h-10 w-28" />
          </div>
        </div>

        {/* Table Skeleton */}
        <div className="overflow-hidden rounded-cards bg-white shadow-steep">
          <div className="p-4">
            {Array.from({ length: 10 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-4 border-b border-fog py-4 last:border-0"
              >
                <Skeleton className="h-12 w-12 rounded-inputs" />
                <div className="flex-1">
                  <Skeleton className="mb-2 h-4 w-48" />
                  <Skeleton className="h-3 w-32" />
                </div>
                <Skeleton className="h-6 w-16" />
                <Skeleton className="h-6 w-20" />
                <Skeleton className="h-8 w-8" />
              </div>
            ))}
          </div>
        </div>
      </PageContainer>
    </div>
  );
}
