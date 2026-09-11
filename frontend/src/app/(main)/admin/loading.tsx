import { Loader2 } from "lucide-react";
import { PageContainer } from "@/app/(main)/admin/_components";

export default function DashboardLoading() {
  return (
    <div className="min-h-screen bg-fog">
      <PageContainer>
        {/* Header */}
        <div className="mb-8 flex flex-col gap-2">
          <div className="h-8 w-32 animate-pulse rounded-inputs bg-white" />
          <div className="h-4 w-48 animate-pulse rounded-inputs bg-white" />
        </div>

        {/* Top Row - Skeleton Cards */}
        <div className="mb-8 grid min-w-0 grid-cols-12 gap-4 lg:gap-6">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="col-span-12 h-40 animate-pulse rounded-cards bg-white p-6 shadow-steep md:col-span-4"
            >
              <div className="mb-4 h-4 w-24 rounded-inputs bg-fog" />
              <div className="h-8 w-16 rounded-inputs bg-fog" />
            </div>
          ))}
        </div>

        {/* Loading Indicator */}
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-ink" />
          <span className="ml-3 text-graphite">加载中...</span>
        </div>
      </PageContainer>
    </div>
  );
}
