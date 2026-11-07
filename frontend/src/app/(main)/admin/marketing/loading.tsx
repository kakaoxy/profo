import { Skeleton } from "@/components/ui/skeleton";
import { PageContainer } from "@/app/(main)/admin/_components";

export default function MarketingProjectsLoading() {
  return (
    <div className="min-h-screen bg-fog">
      <PageContainer className="flex flex-col gap-6">
        <div className="pt-2">
          <Skeleton className="h-3 w-40" />
          <div className="mt-4 flex items-center gap-3">
            <Skeleton className="h-px w-7" />
            <Skeleton className="h-3 w-48" />
          </div>
          <Skeleton className="mt-3 h-12 w-56" />
          <Skeleton className="mt-3 h-4 w-[520px] max-w-full" />
        </div>

        <div className="overflow-hidden rounded-cards bg-white shadow-steep-sm">
          <div className="grid gap-6 p-6 lg:grid-cols-[minmax(250px,0.9fr)_minmax(0,2.2fr)] lg:gap-0">
            <div className="border-b border-dove/30 pb-5 lg:border-r lg:border-b-0 lg:pr-8">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="mt-4 h-16 w-32" />
              <Skeleton className="mt-4 h-4 w-56" />
            </div>
            <div className="grid grid-cols-2 gap-6 lg:grid-cols-4 lg:pl-8">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index}>
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="mt-4 h-11 w-20" />
                  <Skeleton className="mt-3 h-3 w-24" />
                </div>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-4 border-t border-dove/30 bg-fog/60 px-6 py-3">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="ml-auto h-3 w-72" />
          </div>
        </div>

        <div className="overflow-hidden rounded-cards bg-white shadow-steep-sm">
          <div className="flex flex-col gap-4 px-6 pt-6 lg:flex-row lg:items-center lg:justify-between">
            <Skeleton className="h-11 w-full max-w-[360px]" />
            <Skeleton className="h-10 w-20" />
          </div>
          <div className="mt-5 flex flex-col gap-3 border-t border-dove/30 px-6 pt-4">
            <div className="flex flex-wrap items-center gap-3">
              <Skeleton className="h-10 w-80" />
              <div className="ml-auto flex gap-2">
                <Skeleton className="h-9 w-32" />
                <Skeleton className="h-9 w-32" />
                <Skeleton className="h-9 w-28" />
              </div>
            </div>
          </div>
          <div className="mt-4 border-y border-dove/30 bg-fog/60 px-6 py-3">
            <Skeleton className="h-3 w-full" />
          </div>
          <div className="divide-y divide-dove/20">
            {Array.from({ length: 8 }).map((_, index) => (
              <div key={index} className="flex items-center gap-4 px-6 py-4">
                <Skeleton className="h-14 w-[72px] rounded-images" />
                <div className="flex-1">
                  <Skeleton className="h-4 w-52" />
                  <Skeleton className="mt-2 h-3 w-32" />
                </div>
                <Skeleton className="h-6 w-20" />
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-4 w-24" />
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between border-t border-dove/30 px-6 py-4">
            <Skeleton className="h-3 w-44" />
            <Skeleton className="h-8 w-64" />
          </div>
        </div>
      </PageContainer>
    </div>
  );
}
