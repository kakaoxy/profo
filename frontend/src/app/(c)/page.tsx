"use client";

import { Suspense, useCallback, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { useQueryState, parseAsInteger, parseAsString } from "nuqs";
import { SlidersHorizontal, ArrowRight } from "lucide-react";
import { SearchBar } from "@/components/c/project/SearchBar";
import { FilterPanel, type FilterValues } from "@/components/c/project/FilterPanel";
import { StatusTabs } from "@/components/c/project/StatusTabs";
import { ProjectCard } from "@/components/c/project/ProjectCard";
import { Pagination } from "@/components/c/shared/Pagination";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/c/shared/EmptyState";
import { ErrorState } from "@/components/c/shared/ErrorState";
import { publicFetcher } from "@/lib/swr";
import { cLocale } from "@/lib/i18n/c-locale";
import type { components } from "@/lib/api-types";

type ProjectListResponse = components["schemas"]["PublicProjectListResponse"];

const EMPTY_TAGS: string[] = [];

export default function CPage() {
  return (
    <Suspense
      fallback={
        <div>
          {/* Hero skeleton */}
          <div className="flex items-center justify-center bg-fog px-6 py-24">
            <Skeleton className="h-12 w-full max-w-lg rounded-inputs" />
          </div>
          {/* Content skeleton */}
          <div className="mx-auto max-w-[1200px] px-6 py-8 space-y-6">
            <Skeleton className="h-12 w-full" />
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="overflow-hidden rounded-cards bg-white shadow-steep-sm"
                >
                  <Skeleton className="aspect-video w-full" />
                  <div className="space-y-3 p-5">
                    <Skeleton className="h-5 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      }
    >
      <CPageContent />
    </Suspense>
  );
}

function CPageContent() {
  const [page, setPage] = useQueryState(
    "page",
    parseAsInteger.withDefault(1).withOptions({ shallow: true })
  );
  const [status, setStatus] = useQueryState(
    "status",
    parseAsString.withDefault("在售").withOptions({ shallow: true })
  );
  const [search, setSearch] = useQueryState(
    "search",
    parseAsString.withDefault("").withOptions({ shallow: true })
  );
  const [minPrice, setMinPrice] = useQueryState(
    "min_price",
    parseAsString.withOptions({ shallow: true })
  );
  const [maxPrice, setMaxPrice] = useQueryState(
    "max_price",
    parseAsString.withOptions({ shallow: true })
  );
  const [layout, setLayout] = useQueryState(
    "layout",
    parseAsString.withOptions({ shallow: true })
  );
  const [minArea, setMinArea] = useQueryState(
    "min_area",
    parseAsString.withOptions({ shallow: true })
  );
  const [maxArea, setMaxArea] = useQueryState(
    "max_area",
    parseAsString.withOptions({ shallow: true })
  );

  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [filterKey, setFilterKey] = useState(0);

  const pageSize = 9;

  const searchParams = new URLSearchParams({
    project_status: status,
    page: page.toString(),
    page_size: pageSize.toString(),
  });

  if (search) {
    searchParams.set("community_name", search);
  }
  if (minPrice) searchParams.set("min_price", minPrice);
  if (maxPrice) searchParams.set("max_price", maxPrice);
  if (layout) searchParams.set("layout", layout);
  if (minArea) searchParams.set("min_area", minArea);
  if (maxArea) searchParams.set("max_area", maxArea);

  const url = `/api/v1/public/projects?${searchParams.toString()}`;

  const { data, error, isLoading, mutate } = useSWR<ProjectListResponse>(
    url,
    publicFetcher,
    { keepPreviousData: true }
  );

  const handleStatusChange = useCallback(
    (newStatus: string) => {
      setStatus(newStatus);
      setPage(1);
    },
    [setStatus, setPage]
  );

  const handleSearchChange = useCallback(
    (value: string) => {
      setSearch(value);
      setPage(1);
    },
    [setSearch, setPage]
  );

  const hasActiveFilters = !!(minPrice || maxPrice || layout || minArea || maxArea);

  const handleFilterApply = useCallback(
    (filters: FilterValues) => {
      setMinPrice(filters.minPrice || null);
      setMaxPrice(filters.maxPrice || null);
      setLayout(filters.layout || null);
      setMinArea(filters.minArea || null);
      setMaxArea(filters.maxArea || null);
      setPage(1);
      setIsFilterOpen(false);
    },
    [setMinPrice, setMaxPrice, setLayout, setMinArea, setMaxArea, setPage]
  );

  const handleFilterReset = useCallback(() => {
    setMinPrice(null);
    setMaxPrice(null);
    setLayout(null);
    setMinArea(null);
    setMaxArea(null);
    setPage(1);
  }, [setMinPrice, setMaxPrice, setLayout, setMinArea, setMaxArea, setPage]);

  const totalPages = data ? Math.ceil(data.total / pageSize) : 0;

  return (
    <div>
      {/* ─── Hero Section ─── */}
      <section className="relative overflow-hidden bg-fog">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse at 30% 40%, rgba(251,225,209,0.5) 0%, transparent 65%)",
          }}
        />
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(circle at 80% 20%, rgba(211,227,252,0.2) 0%, transparent 50%)",
          }}
        />

        <div className="relative z-10 mx-auto flex max-w-[1200px] flex-col items-center px-6 py-16 text-center md:py-24 lg:py-32">
          <h1 className="font-display text-3xl text-ink md:text-5xl lg:text-[56px]">
            {cLocale.home.hero.title}
          </h1>
          <p className="mt-4 max-w-xl text-base text-ash md:text-lg">
            {cLocale.home.hero.subtitle}
          </p>
          <div className="mt-4 flex items-center gap-2">
            {cLocale.home.hero.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-apricot-wash px-3 py-1 text-xs font-medium tracking-[-0.009em] text-rust"
              >
                {tag}
              </span>
            ))}
          </div>
          <div className="mt-8 w-full max-w-lg">
            <SearchBar onSearchChange={handleSearchChange} />
          </div>
          <Link
            href="/valuation"
            className="group mt-5 inline-flex items-center gap-1.5 text-[15px] font-medium text-ink tracking-[-0.009em] hover:underline"
          >
            {cLocale.home.hero.ownerCta}
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
          <p className="mt-2 text-xs text-graphite tracking-[-0.009em]">
            {cLocale.home.hero.ownerCtaHint}
          </p>
        </div>
      </section>

      {/* ─── Content Section ─── */}
      <div className="mx-auto max-w-[1200px] px-6 py-8">
        {/* Sticky 估价 CTA（移动端，审批意见补充建议第4条） */}
        <div className="sticky top-16 z-30 -mx-6 mb-6 bg-fog/95 px-6 py-3 backdrop-blur md:hidden">
          <Link
            href="/valuation"
            className="flex w-full items-center justify-center gap-2 rounded-full bg-ink py-3 text-base font-medium text-white tracking-[-0.009em] transition-all hover:opacity-90 active:scale-[0.98]"
          >
            {cLocale.home.stickyCta}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        {/* Filter toggle */}
        <div className="mb-6 flex justify-end">
          <button
            onClick={() => {
              const nextOpen = !isFilterOpen;
              setIsFilterOpen(nextOpen);
              if (nextOpen) setFilterKey((k) => k + 1);
            }}
            aria-label={isFilterOpen ? cLocale.home.filter.collapse : cLocale.home.filter.expand}
            aria-expanded={isFilterOpen}
            title={isFilterOpen ? cLocale.home.filter.collapse : cLocale.home.filter.expand}
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border transition-colors ${
              hasActiveFilters
                ? "border-transparent bg-apricot-wash text-rust"
                : "border-dove/30 bg-white text-graphite hover:border-dove/60 hover:text-ink"
            }`}
          >
            <SlidersHorizontal className="h-4 w-4" />
          </button>
        </div>

        {/* Filter panel */}
        <div
          className={`grid transition-all duration-300 ease-in-out ${
            isFilterOpen
              ? "grid-rows-[1fr] opacity-100"
              : "grid-rows-[0fr] opacity-0"
          }`}
        >
          <div className="overflow-hidden">
            <FilterPanel
              key={filterKey}
              onApply={handleFilterApply}
              onReset={handleFilterReset}
              initialFilters={{
                minPrice: minPrice || "",
                maxPrice: maxPrice || "",
                layout: layout || "",
                minArea: minArea || "",
                maxArea: maxArea || "",
              }}
            />
          </div>
        </div>

        {/* Status tabs + result count */}
        <nav className="mb-8">
          <StatusTabs
            value={status}
            onStatusChange={handleStatusChange}
            total={data?.total}
          />
        </nav>

        {/* Project grid */}
        <section>
          {isLoading && !data ? (
            <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="overflow-hidden rounded-cards bg-white shadow-steep-sm"
                >
                  <Skeleton className="aspect-video w-full" />
                  <div className="space-y-3 p-5">
                    <Skeleton className="h-5 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                    <div className="flex gap-2">
                      <Skeleton className="h-5 w-12" />
                      <Skeleton className="h-5 w-12" />
                    </div>
                    <div className="border-t border-dove/30 pt-3">
                      <Skeleton className="h-6 w-1/3" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : error ? (
            <ErrorState onRetry={() => mutate()} />
          ) : !data?.items.length ? (
            <EmptyState
              title={cLocale.home.empty.title}
              description={cLocale.home.empty.description}
            />
          ) : (
            <>
              <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
                {data.items.map((project) => (
                  <ProjectCard
                    key={project.id}
                    id={project.id}
                    communityName={project.community_name ?? null}
                    layout={project.layout}
                    orientation={project.orientation}
                    area={project.area}
                    totalPrice={project.total_price}
                    unitPrice={project.unit_price}
                    title={project.title}
                    coverImage={project.cover_image ?? null}
                    tags={project.tags ?? EMPTY_TAGS}
                    projectStatus={project.project_status}
                    decorationStyle={project.decoration_style ?? null}
                  />
                ))}
              </div>

              <Pagination
                currentPage={page}
                totalPages={totalPages}
                onPageChange={setPage}
              />
            </>
          )}
        </section>
      </div>
    </div>
  );
}
