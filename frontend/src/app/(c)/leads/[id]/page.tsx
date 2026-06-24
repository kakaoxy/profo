"use client";

import { useParams, useRouter } from "next/navigation";
import useSWR from "swr";
import { LeadInfoCard } from "@/components/c/lead/LeadInfoCard";
import { SystemEstimateCard } from "@/components/c/lead/SystemEstimateCard";
import { FollowUpList } from "@/components/c/lead/FollowUpList";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/c/shared/ErrorState";
import { ShieldAlert } from "lucide-react";
import { fetcher, ForbiddenError } from "@/lib/swr";
import { safeParseDate } from "@/lib/validators";
import type { components } from "@/lib/api-types";

type LeadDetail = components["schemas"]["PublicLeadDetail"];

function ForbiddenState() {
  const router = useRouter();
  return (
    <div className="flex flex-col items-center justify-center py-20 text-ash">
      <ShieldAlert className="mb-4 h-12 w-12 text-ink/50" />
      <p className="text-lg font-medium text-ink">无权查看该线索</p>
      <p className="mt-1 text-sm">您没有权限查看此线索的详细信息</p>
      <button
        onClick={() => router.push("/my")}
        className="mt-4 rounded-full border border-dove/30 bg-white px-6 py-2 text-sm font-medium text-ink hover:bg-fog transition-colors"
      >
        返回我的估价
      </button>
    </div>
  );
}

export default function LeadDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const { data, error, isLoading, mutate } = useSWR<LeadDetail>(
    id ? `/api/v1/public/leads/${id}` : null,
    fetcher
  );

  if (isLoading) {
    return (
      <div className="mx-auto max-w-[1200px] px-4 md:px-6 py-8 space-y-6">
        <Skeleton className="h-40 rounded-cards" />
        <Skeleton className="h-32 rounded-cards" />
        <Skeleton className="h-48 rounded-cards" />
      </div>
    );
  }

  if (error) {
    if (error instanceof ForbiddenError) {
      return <ForbiddenState />;
    }
    return <ErrorState onRetry={() => mutate()} />;
  }

  if (!data) {
    return <ErrorState onRetry={() => mutate()} />;
  }

  const formattedDate =
    safeParseDate(data.created_at)?.toLocaleString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }) ?? "-";

  return (
    <div className="mx-auto max-w-[1200px] px-4 md:px-6 py-8 space-y-6">
      <LeadInfoCard
        communityName={data.community_name}
        layout={data.layout ?? null}
        area={data.area ?? null}
        floorInfo={data.floor_info ?? null}
        orientation={data.orientation ?? null}
        remarks={data.remarks ?? null}
        createdAt={formattedDate}
      />

      <SystemEstimateCard
        evalPrice={data.eval_price ?? null}
        statusColor={data.status_color}
        createdAt={formattedDate}
      />

      <FollowUpList followUps={data.follow_ups ?? []} />
    </div>
  );
}
