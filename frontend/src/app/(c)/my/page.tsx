"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import useSWR from "swr";
import { LogOut, Pencil } from "lucide-react";
import { UserAvatar } from "@/components/c/shared/UserAvatar";
import { LeadListItem } from "@/components/c/lead/LeadListItem";
import { logoutAction } from "@/lib/api-c/auth";
import { useUserInfo } from "@/lib/api-c/user-info";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/c/shared/EmptyState";
import { ErrorState } from "@/components/c/shared/ErrorState";
import { fetcher, AuthError } from "@/lib/swr";
import type { components } from "@/lib/api-types";

type LeadListResponse = components["schemas"]["PublicLeadListResponse"];

export default function CMyPage() {
  const router = useRouter();
  const userInfo = useUserInfo();

  const displayName = userInfo.nickname || "用户";
  const displayPhone = userInfo.phone || "未设置手机号";

  const { data, error, isLoading, mutate } = useSWR<LeadListResponse>(
    "/api/v1/public/leads/mine",
    fetcher
  );

  useEffect(() => {
    if (error instanceof AuthError) {
      router.replace("/login?redirect=/my");
    }
  }, [error, router]);

  const handleLogout = async () => {
    await logoutAction();
  };

  return (
    <div className="mx-auto max-w-[1200px] px-4 md:px-6 space-y-6">
      <section className="flex items-center gap-4 rounded-cards bg-white p-5 md:p-6 shadow-steep">
        <UserAvatar name={displayName} size="lg" />
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-medium text-ink">{displayName}</h2>
          <p className="text-sm text-graphite">{displayPhone}</p>
        </div>
        <Link
          href="/profile"
          className="flex items-center gap-1 text-sm font-medium text-ink hover:underline"
        >
          <Pencil className="h-3.5 w-3.5" />
          编辑资料
        </Link>
      </section>

      <section>
        <h3 className="text-base font-medium text-ink mb-3">
          我的估价
        </h3>
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton
                key={i}
                className="h-24 rounded-cards"
              />
            ))}
          </div>
        ) : error ? (
          <ErrorState onRetry={() => mutate()} />
        ) : !data?.items.length ? (
          <EmptyState
            title="暂无估价记录"
            description="提交房源估价后，这里会显示您的估价记录"
          />
        ) : (
          <div className="space-y-3">
            {data.items.map((lead) => (
              <LeadListItem
                key={lead.id}
                id={String(lead.id)}
                communityName={lead.community_name}
                layout={lead.layout ?? null}
                area={lead.area ?? null}
                status={lead.status}
                statusDisplay={lead.status_display}
                statusColor={lead.status_color}
                createdAt={lead.created_at}
              />
            ))}
          </div>
        )}
      </section>

      <section className="pt-4">
        <button
          onClick={handleLogout}
          className="flex w-full items-center justify-center gap-2 h-12 rounded-full border border-dove/30 bg-white text-ink font-medium hover:bg-fog transition-colors"
        >
          <LogOut className="h-4 w-4" />
          退出登录
        </button>
      </section>
    </div>
  );
}
