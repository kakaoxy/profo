"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import useSWR from "swr";
import { LogOut, ArrowRight, Pencil } from "lucide-react";
import { UserAvatar } from "@/components/c/shared/UserAvatar";
import { LeadListItem } from "@/components/c/lead/LeadListItem";
import { useSession, useAuth } from "@/lib/auth/client";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/c/shared/EmptyState";
import { ErrorState } from "@/components/c/shared/ErrorState";
import { fetcher, AuthError, ForbiddenError } from "@/lib/swr";
import { cLocale } from "@/lib/i18n/c-locale";
import type { components } from "@/lib/api-types";

type LeadListResponse = components["schemas"]["PublicLeadListResponse"];

export default function CMyPage() {
  const router = useRouter();
  const session = useSession();
  const { logout } = useAuth();
  const userInfo = {
    nickname: session.status === "authenticated" ? session.user.nickname : null,
    phone: session.status === "authenticated" ? session.user.phone : null,
  };

  const displayName = userInfo.nickname || cLocale.common.user.defaultName;
  const displayPhone = userInfo.phone || cLocale.common.user.phoneUnset;

  const { data, error, isLoading, mutate } = useSWR<LeadListResponse>(
    "/api/v1/public/leads/mine",
    fetcher
  );

  useEffect(() => {
    if (error instanceof AuthError || error instanceof ForbiddenError) {
      router.replace("/login?redirect=/my");
    }
  }, [error, router]);

  const handleLogout = async () => {
    await logout({ callbackUrl: "/login", redirect: true });
  };

  return (
    <div className="mx-auto max-w-[1200px] px-4 md:px-6">
      {/* Page heading — Signifier for section-level voice */}
      <div className="pb-8 pt-4 md:pb-12">
        <h1 className="text-[26px] font-medium leading-[1.18] tracking-[-0.23px] text-ink">
          {cLocale.my.myValuation}
        </h1>
      </div>

      {/* Profile card — Steep Product Dashboard Card pattern */}
      <section className="mb-8 md:mb-12">
        <div className="flex items-center gap-5 rounded-cards bg-white p-6 shadow-steep-sm border border-dove/30">
          <UserAvatar name={displayName} size="lg" />
          <div className="flex-1 min-w-0">
            <h2 className="text-[18px] font-medium leading-[1.35] tracking-[-0.16px] text-ink">
              {displayName}
            </h2>
            <p className="mt-0.5 text-[14px] leading-[1.5] tracking-[-0.13px] text-graphite">
              {displayPhone}
            </p>
          </div>
          <Link
            href="/profile"
            className="inline-flex items-center gap-1.5 rounded-full bg-fog px-4 py-2 text-[15px] font-medium tracking-[-0.009em] text-ink transition-colors hover:bg-dove/20"
            aria-label={cLocale.common.action.editProfile}
          >
            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
            {cLocale.common.action.editProfile}
          </Link>
        </div>
      </section>

      {/* Leads list section */}
      <section className="mb-12 md:mb-20">
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
          <div className="space-y-6">
            <EmptyState
              title={cLocale.my.empty.title}
              description={cLocale.my.empty.description}
            />
            <div className="text-center">
              <Link
                href="/valuation"
                className="inline-flex items-center gap-2 rounded-full bg-ink px-6 py-3 text-[15px] font-medium tracking-[-0.009em] text-white transition-colors hover:bg-ink/90"
              >
                {cLocale.my.goToValuation}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
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

      {/* Logout — text link style per Steep: secondary = text link, not ghost button */}
      <section className="pb-24 md:pb-12">
        <button
          onClick={handleLogout}
          type="button"
          className="flex w-full items-center justify-center gap-2 py-3 text-[15px] font-medium tracking-[-0.009em] text-graphite transition-colors hover:text-ink"
          aria-label={cLocale.common.action.logout}
        >
          <LogOut className="h-4 w-4" aria-hidden="true" />
          {cLocale.common.action.logout}
        </button>
      </section>
    </div>
  );
}
