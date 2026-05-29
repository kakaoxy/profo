"use client";

import { useParams, useRouter } from "next/navigation";
import useSWR from "swr";
import { LeadInfoCard } from "@/components/c/lead/LeadInfoCard";
import { SystemEstimateCard } from "@/components/c/lead/SystemEstimateCard";
import { FollowUpList } from "@/components/c/lead/FollowUpList";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/c/shared/ErrorState";
import { ShieldAlert } from "lucide-react";

interface LeadDetail {
  id: string;
  community_name: string;
  layout: string | null;
  area: number | null;
  floor_info: string | null;
  orientation: string | null;
  remarks: string | null;
  created_at: string;
  eval_price: number | null;
  status_color: string;
  follow_ups: {
    id: string;
    method: string;
    content: string;
    followed_at: string;
  }[];
}

class ForbiddenError extends Error {
  constructor() {
    super("FORBIDDEN");
    this.name = "ForbiddenError";
  }
}

async function fetchLeadDetail<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: "include" });
  if (res.status === 403) throw new ForbiddenError();
  if (!res.ok) throw new Error("Failed to fetch");
  return res.json();
}

function ForbiddenState() {
  const router = useRouter();
  return (
    <div className="flex flex-col items-center justify-center py-20 text-c-text-secondary">
      <ShieldAlert className="mb-4 h-12 w-12 text-c-trust-blue/50" />
      <p className="text-lg font-medium text-c-text-primary">无权查看该线索</p>
      <p className="mt-1 text-sm">您没有权限查看此线索的详细信息</p>
      <button
        onClick={() => router.push("/c/my")}
        className="mt-4 rounded-lg border border-c-border-subtle bg-white px-6 py-2 text-sm font-medium text-c-trust-blue hover:bg-c-surface transition-colors"
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
    fetchLeadDetail
  );

  if (isLoading) {
    return (
      <div className="px-4 md:px-6 py-8 space-y-6">
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-48 rounded-xl" />
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

  const formattedDate = new Date(data.created_at).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="px-4 md:px-6 py-8 space-y-6">
      <LeadInfoCard
        communityName={data.community_name}
        layout={data.layout}
        area={data.area}
        floorInfo={data.floor_info}
        orientation={data.orientation}
        remarks={data.remarks}
        createdAt={formattedDate}
      />

      <SystemEstimateCard
        evalPrice={data.eval_price}
        statusColor={data.status_color}
        createdAt={formattedDate}
      />

      <FollowUpList followUps={data.follow_ups ?? []} />
    </div>
  );
}
