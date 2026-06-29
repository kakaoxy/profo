"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import useSWR from "swr";
import { LogOut, Pencil, ArrowRight } from "lucide-react";
import { UserAvatar } from "@/components/c/shared/UserAvatar";
import { LeadListItem } from "@/components/c/lead/LeadListItem";
import { logoutAction } from "@/lib/api-c/auth";
import { useUserInfo } from "@/lib/api-c/user-info";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/c/shared/EmptyState";
import { ErrorState } from "@/components/c/shared/ErrorState";
import { fetcher, AuthError, ForbiddenError } from "@/lib/swr";
import { cLocale } from "@/lib/i18n/c-locale";
import type { components } from "@/lib/api-types";

type LeadListResponse = components["schemas"]["PublicLeadListResponse"];

export default function CMyPage() {
  const router = useRouter();
  const userInfo = useUserInfo();

  const displayName = userInfo.nickname || cLocale.common.user.defaultName;
  const displayPhone = userInfo.phone || cLocale.common.user.phoneUnset;

  const { data, error, isLoading, mutate } = useSWR<LeadListResponse>(
    "/api/v1/public/leads/mine",
    fetcher
  );

  useEffect(() => {
    // 401(未登录/token失效) 或 403(非customer角色) 均视为需要登录
    if (error instanceof AuthError || error instanceof ForbiddenError) {
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
          {cLocale.common.action.editProfile}
        </Link>
      </section>

      <section>
        <h3 className="text-base font-medium text-ink mb-3">
          {cLocale.my.myValuation}
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
          <div className="space-y-4">
            <EmptyState
              title={cLocale.my.empty.title}
              description={cLocale.my.empty.description}
            />
            <div className="text-center">
              <Link
                href="/valuation"
                className="inline-flex items-center gap-1 text-sm font-medium text-rust hover:underline"
              >
                去免费预审
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
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
          className="flex w-full items-center justify-center gap-2 h-12 rounded-full text-graphite font-medium hover:text-ink hover:underline transition-colors"
        >
          <LogOut className="h-4 w-4" />
          {cLocale.common.action.logout}
        </button>
      </section>
    </div>
  );
}
