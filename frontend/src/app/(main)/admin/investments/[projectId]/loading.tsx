import { Skeleton } from "@/components/ui/skeleton";
import { PageContainer } from "@/app/(main)/admin/_components";

export default function InvestmentDetailLoading() {
  return (
    <div className="min-h-screen bg-fog">
      <PageContainer className="flex flex-col gap-6">
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

        <Skeleton className="h-64 rounded-2xl" />

        <Skeleton className="h-72 rounded-2xl" />

        <Skeleton className="h-56 rounded-2xl" />

        <Skeleton className="h-48 rounded-2xl" />
      </PageContainer>
    </div>
  );
}
