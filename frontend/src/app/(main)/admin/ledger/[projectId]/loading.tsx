import { Skeleton } from "@/components/ui/skeleton";
import { PageContainer } from "@/app/(main)/admin/_components";

export default function LedgerDetailLoading() {
  return (
    <div className="min-h-screen bg-fog">
      <PageContainer className="flex flex-col gap-6">
        {/* Header 骨架 */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Skeleton className="h-9 w-28 rounded-full" />
            <Skeleton className="h-8 w-64" />
          </div>
          <div className="flex gap-3">
            <Skeleton className="h-9 w-20 rounded-full" />
            <Skeleton className="h-9 w-16" />
          </div>
        </div>

        {/* 汇总卡片骨架 */}
        <Skeleton className="h-48 rounded-cards" />

        {/* 趋势图骨架 */}
        <Skeleton className="h-72 rounded-cards" />

        {/* 表格骨架 */}
        <div className="space-y-4">
          <Skeleton className="h-9 w-64 rounded-cards" />
          <Skeleton className="h-96 rounded-cards" />
        </div>
      </PageContainer>
    </div>
  );
}
