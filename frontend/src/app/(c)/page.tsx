"use client";

import { Suspense, useCallback, useState } from "react";
import useSWR from "swr";
import { useQueryState, parseAsInteger, parseAsString } from "nuqs";
import { SlidersHorizontal } from "lucide-react";
import { SearchBar } from "@/components/c/project/SearchBar";
import { FilterPanel, type FilterValues } from "@/components/c/project/FilterPanel";
import { StatusTabs } from "@/components/c/project/StatusTabs";
import { ProjectCard } from "@/components/c/project/ProjectCard";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/c/shared/EmptyState";
import { ErrorState } from "@/components/c/shared/ErrorState";
import { publicFetcher } from "@/lib/swr";
import type { components } from "@/lib/api-types";

type ProjectListResponse = components["schemas"]["PublicProjectListResponse"];

const EMPTY_TAGS: string[] = [];

export default function CPage() {
  return (
    <Suspense
      fallback={
        <div className="px-4 md:px-6 space-y-4">
          <div className="flex items-center gap-3">
            <Skeleton className="h-12 flex-1 rounded-inputs" />
            <Skeleton className="h-12 w-12 rounded-full" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="bg-white rounded-cards overflow-hidden shadow-steep"
              >
                <Skeleton className="aspect-video w-full" />
                <div className="p-5 space-y-3">
                  <Skeleton className="h-5 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                </div>
              </div>
            ))}
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
    <div className="px-4 md:px-6 space-y-4">
      <section className="flex items-center gap-3">
        <div className="flex-1">
          <SearchBar onSearchChange={handleSearchChange} />
        </div>
        <button
          onClick={() => {
            const nextOpen = !isFilterOpen;
            setIsFilterOpen(nextOpen);
            if (nextOpen) setFilterKey((k) => k + 1);
          }}
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full border transition-colors ${
            hasActiveFilters
              ? "border-transparent bg-apricot-wash text-rust"
              : "border-dove/30 bg-white text-graphite hover:text-ink hover:border-dove/60"
          }`}
        >
          <SlidersHorizontal className="h-5 w-5" />
        </button>
      </section>

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

      <nav>
        <StatusTabs value={status} onStatusChange={handleStatusChange} />
      </nav>

      <section>
        {isLoading && !data ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="bg-white rounded-cards overflow-hidden shadow-steep"
              >
                <Skeleton className="aspect-video w-full" />
                <div className="p-5 space-y-3">
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
            title="暂无房源"
            description="当前筛选条件下没有找到房源，试试调整筛选条件"
          />
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
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

            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-4 pt-8 pb-4">
                <button
                  onClick={() => setPage(Math.max(1, page - 1))}
                  disabled={page <= 1}
                  className="text-[15px] font-medium text-ink hover:underline disabled:opacity-40 disabled:cursor-not-allowed disabled:no-underline transition-colors"
                >
                  上一页
                </button>
                <span className="text-[15px] text-graphite">
                  {page} / {totalPages}
                </span>
                <button
                  onClick={() => setPage(Math.min(totalPages, page + 1))}
                  disabled={page >= totalPages}
                  className="text-[15px] font-medium text-ink hover:underline disabled:opacity-40 disabled:cursor-not-allowed disabled:no-underline transition-colors"
                >
                  下一页
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
