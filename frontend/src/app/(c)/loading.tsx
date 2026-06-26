import { Skeleton } from "@/components/ui/skeleton";

export default function CLoading() {
  return (
    <div className="mx-auto max-w-[1200px] px-4 md:px-6 py-8 space-y-6">
      <Skeleton className="h-24 rounded-cards" />
      <Skeleton className="h-32 rounded-cards" />
      <Skeleton className="h-48 rounded-cards" />
    </div>
  );
}
