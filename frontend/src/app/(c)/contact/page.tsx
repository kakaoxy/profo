"use client";

import useSWR from "swr";
import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Search } from "lucide-react";
import { useDebouncedCallback } from "use-debounce";
import { SoldProjectCard } from "@/components/c/project/SoldProjectCard";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/c/shared/EmptyState";
import { ErrorState } from "@/components/c/shared/ErrorState";
import { publicFetcher } from "@/lib/swr";
import { cLocale } from "@/lib/i18n/c-locale";
import type { components } from "@/lib/api-types";

type SoldListResponse = components["schemas"]["PublicSoldProjectListResponse"];
type PlatformStats = components["schemas"]["PublicPlatformStats"];

export default function ContactPage() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const handleSearchChange = useDebouncedCallback((value: string) => {
    setDebouncedSearch(value);
  }, 300);

  const soldUrl = debouncedSearch
    ? `/api/v1/public/projects/sold?community_name=${encodeURIComponent(debouncedSearch)}`
    : "/api/v1/public/projects/sold";

  const { data: soldData, isLoading: soldLoading, error: soldError, mutate: mutateSold } = useSWR<SoldListResponse>(
    soldUrl,
    publicFetcher
  );

  const { data: statsData, isLoading: statsLoading } = useSWR<PlatformStats>(
    "/api/v1/public/stats/platform",
    publicFetcher
  );

  return (
    <div className="mx-auto max-w-[1200px]">
      <section className="relative overflow-hidden bg-white px-4 md:px-6 py-12">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(circle at 30% 20%, rgba(251,225,209,0.6) 0%, transparent 60%)",
          }}
        />

        <div className="relative z-10">
          <span className="inline-block rounded-full bg-apricot-wash px-3 py-1 text-xs font-medium tracking-[-0.009em] text-rust">
            {cLocale.contact.realDataBadge}
          </span>
          <h2 className="mt-4 whitespace-pre-line text-3xl font-medium leading-snug text-ink tracking-[-0.009em]">
            {cLocale.contact.title}
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-ash tracking-[-0.009em]">
            {cLocale.contact.subtitle}
          </p>
        </div>
      </section>

      <section className="bg-fog px-4 md:px-6 py-8">
        <div className="mb-5 flex items-center gap-2">
          <div className="h-5 w-1 rounded-full bg-rust" />
          <span className="text-sm font-medium text-ink tracking-[-0.009em]">
            {cLocale.contact.recentLabel}
          </span>
        </div>

        <div className="relative mb-5">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-graphite" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              handleSearchChange(e.target.value);
            }}
            placeholder={cLocale.contact.searchPlaceholder}
            className="h-10 w-full rounded-inputs border border-dove/30 bg-white pl-9 pr-3 text-sm text-ink placeholder:text-graphite tracking-[-0.009em]"
          />
        </div>

        {soldLoading ? (
          <div className="grid grid-cols-1 gap-5">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="rounded-cards bg-white p-6 shadow-steep-sm"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-5 w-10 rounded-full" />
                    <Skeleton className="h-6 w-32" />
                  </div>
                  <Skeleton className="h-8 w-20" />
                </div>
                <Skeleton className="mt-2 h-4 w-48" />
                <div className="mt-4 border-t border-dove/30 pt-4">
                  <Skeleton className="h-5 w-28" />
                </div>
              </div>
            ))}
          </div>
        ) : soldError ? (
          <ErrorState onRetry={() => mutateSold()} />
        ) : !soldData?.items.length ? (
          <EmptyState
            title={cLocale.contact.empty.title}
            description={cLocale.contact.empty.description}
          />
        ) : (
          <div className="grid grid-cols-1 gap-5">
            {soldData.items.map((project) => (
              <SoldProjectCard
                key={project.id}
                id={project.id}
                communityName={project.community_name ?? null}
                layout={project.layout}
                area={project.area}
                totalPrice={project.total_price}
                unitPrice={project.unit_price}
                title={project.title}
                coverImage={project.cover_image ?? null}
                soldDays={project.sold_days ?? null}
                decorationStyle={project.decoration_style ?? null}
              />
            ))}
          </div>
        )}
      </section>

      <section className="border-t border-dove/30 bg-white px-4 md:px-6 py-10">
        <div className="mb-6 text-center">
          <span className="inline-block rounded-full bg-apricot-wash px-3 py-1 text-xs font-medium tracking-[-0.009em] text-rust">
            {cLocale.contact.platformBadge}
          </span>
          <h3 className="mt-3 text-2xl font-medium text-ink tracking-[-0.009em]">
            {cLocale.contact.platformTitle}
          </h3>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col items-center justify-center rounded-cards bg-white px-4 py-6 shadow-steep-sm">
            <span className="text-3xl font-medium text-ink tracking-[-0.009em]">
              {cLocale.contact.ownersValue}
            </span>
            <span className="mt-1 text-xs font-medium uppercase tracking-[0.2em] text-graphite">
              {cLocale.contact.ownersLabel}
            </span>
          </div>
          <div className="flex flex-col items-center justify-center rounded-cards bg-white px-4 py-6 shadow-steep-sm">
            {statsLoading ? (
              <Skeleton className="h-9 w-14" />
            ) : (
              <span className="text-3xl font-medium text-ink tracking-[-0.009em]">
                {statsData?.on_sale_count ?? 0}
              </span>
            )}
            <span className="mt-1 text-xs font-medium uppercase tracking-[0.2em] text-graphite">
              {cLocale.contact.statOnSale}
            </span>
          </div>
        </div>

        <div className="mt-4 flex flex-col items-center justify-center rounded-cards bg-apricot-wash px-4 py-6">
          {statsLoading ? (
            <Skeleton className="h-9 w-14" />
          ) : (
            <span className="text-3xl font-medium text-rust tracking-[-0.009em]">
              {statsData?.current_month_sold ?? 0}
            </span>
          )}
          <span className="mt-1 text-xs font-medium uppercase tracking-[0.2em] text-ink">
            {cLocale.contact.statMonthSold}
          </span>
        </div>
      </section>

      <section className="relative overflow-hidden bg-fog px-4 md:px-6 py-12">
        <div className="relative z-10 text-center">
          <span className="inline-block rounded-full bg-apricot-wash px-3 py-1 text-xs font-medium tracking-[-0.009em] text-rust">
            {cLocale.contact.actionBadge}
          </span>
          <h3 className="mt-4 text-2xl font-medium text-ink tracking-[-0.009em]">
            {cLocale.contact.actionTitle}
          </h3>
          <p className="mt-2 text-sm text-ash tracking-[-0.009em]">
            {cLocale.contact.actionDesc}
          </p>
          <Link
            href="/about"
            className="mt-6 inline-flex items-center gap-2 text-[15px] font-medium text-ink tracking-[-0.009em] hover:underline"
          >
            {cLocale.contact.learnMore}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <div className="fixed bottom-20 inset-x-0 z-40 border-t border-dove/30 bg-white/95 px-4 py-3 backdrop-blur md:bottom-0">
        <Link
          href="/valuation"
          className="flex w-full items-center justify-center rounded-full bg-ink py-3 text-base font-medium text-white tracking-[-0.009em] transition-all hover:opacity-90 active:scale-[0.98]"
        >
          {cLocale.contact.cta}
        </Link>
      </div>
    </div>
  );
}
