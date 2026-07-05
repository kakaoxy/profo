import { Skeleton } from "@/components/ui/skeleton";

export default function InvestmentDetailLoading() {
  return (
    <div className="min-h-screen bg-muted">
      <div className="w-full max-w-[1200px] mx-auto flex flex-col gap-6 py-8 px-4 sm:px-6 lg:px-8">
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
      </div>
    </div>
  );
}
