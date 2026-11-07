"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ChevronRight,
  ImageOff,
  LayoutGrid,
  List,
  Plus,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getFileUrl } from "@/lib/config";
import { formatArea, formatPrice, formatUnitPrice, safeFormatDate } from "@/lib/formatters";
import type { L4MarketingProject } from "../types";
import { MarketingPagination } from "./marketing-pagination";

interface MarketingSummary {
  total?: number;
  published?: number;
  draft?: number;
  for_sale?: number;
  sold?: number;
  in_progress?: number;
  total_views?: number;
}

interface MarketingViewProps {
  data: L4MarketingProject[];
  total: number;
  summary?: MarketingSummary;
}

type QuickFilter = "all" | "new" | "price" | "draft";
type ViewMode = "table" | "gallery";

const ROOM_COUNT_REGEX = /(\d+)室/;

const QUICK_FILTERS: Array<{ value: QuickFilter; label: string }> = [
  { value: "all", label: "全部房源" },
  { value: "new", label: "新上房源" },
  { value: "price", label: "近期调价" },
  { value: "draft", label: "待发布" },
];

function getProjectImage(project: L4MarketingProject): string | null {
  if (project.cover_image || project.cover_thumbnail_url) {
    return getFileUrl(project.cover_thumbnail_url || project.cover_image);
  }
  const firstMedia = project.media_files?.[0];
  if (firstMedia) {
    return getFileUrl(firstMedia.thumbnail_url || firstMedia.file_url);
  }
  if (Array.isArray(project.images) && project.images.length > 0) {
    return getFileUrl(project.images[0]);
  }
  return null;
}

function getRoomCount(layout: string | null | undefined): number | null {
  if (!layout) return null;
  const match = layout.match(ROOM_COUNT_REGEX);
  return match ? Number.parseInt(match[1], 10) : null;
}

function matchesLayout(project: L4MarketingProject, layoutFilter: string): boolean {
  if (layoutFilter === "all") return true;
  const roomCount = getRoomCount(project.layout);
  if (roomCount === null) return false;
  if (layoutFilter === "other") return roomCount >= 4;
  return String(roomCount) === layoutFilter;
}

function matchesSearch(project: L4MarketingProject, query: string): boolean {
  const search = query.trim().toLowerCase();
  if (!search) return true;
  return [project.title, project.layout, project.orientation, project.community_name]
    .filter(Boolean)
    .some((value) => value!.toLowerCase().includes(search));
}

function PublishBadge({ project }: { project: L4MarketingProject }) {
  const published = project.publish_status === "发布";
  return (
    <span
      className={`inline-flex h-6 items-center rounded-full px-2.5 text-[11px] font-medium ${
        published ? "bg-rust text-white" : "bg-fog text-graphite"
      }`}
    >
      {published ? "已发布" : "草稿"}
    </span>
  );
}

function SaleBadge({ status }: { status: string | null | undefined }) {
  const value = status || "在途";
  return (
    <span
      className={`inline-flex h-6 items-center rounded-full px-2.5 text-[11px] font-medium ${
        value === "在售"
          ? "bg-ink text-white"
          : value === "已售"
            ? "bg-dove/20 text-dove"
            : "bg-fog text-ash"
      }`}
    >
      {value}
    </span>
  );
}

export function MarketingView({ data, total, summary }: MarketingViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const [publishTab, setPublishTab] = useState(searchParams.get("publish_status") || "all");
  const [saleTab, setSaleTab] = useState(searchParams.get("project_status") || "all");
  const [badgeFilter, setBadgeFilter] = useState(searchParams.get("badge_filter") || "all");
  const [layoutFilter, setLayoutFilter] = useState(searchParams.get("layout") || "all");
  const [searchQuery, setSearchQuery] = useState(searchParams.get("search") || "");
  const [viewMode, setViewMode] = useState<ViewMode>("table");

  const updateUrlParams = useCallback(
    (updates: Record<string, string | undefined>) => {
      const params = new URLSearchParams(searchParams.toString());
      Object.entries(updates).forEach(([key, value]) => {
        if (!value || value === "all") params.delete(key);
        else params.set(key, value);
      });
      params.set("page", "1");
      router.push(`/admin/marketing?${params.toString()}`);
    },
    [router, searchParams],
  );

  const setQuickFilter = useCallback(
    (value: QuickFilter) => {
      setBadgeFilter(value === "new" || value === "price" ? value : "all");
      setPublishTab(value === "draft" ? "草稿" : "all");
      if (value === "new" || value === "price") {
        updateUrlParams({ badge_filter: value, publish_status: undefined });
      } else if (value === "draft") {
        updateUrlParams({ publish_status: "草稿", badge_filter: undefined });
      } else {
        updateUrlParams({ publish_status: undefined, badge_filter: undefined });
      }
    },
    [updateUrlParams],
  );

  const handlePublishChange = useCallback(
    (value: string) => {
      setPublishTab(value);
      setBadgeFilter("all");
      updateUrlParams({ publish_status: value === "all" ? undefined : value, badge_filter: undefined });
    },
    [updateUrlParams],
  );

  const handleSaleChange = useCallback(
    (value: string) => {
      setSaleTab(value);
      updateUrlParams({ project_status: value === "all" ? undefined : value });
    },
    [updateUrlParams],
  );

  const activeQuick: QuickFilter =
    publishTab === "草稿" ? "draft" : badgeFilter === "new" || badgeFilter === "price" ? badgeFilter : "all";

  const filteredData = useMemo(
    () =>
      data.filter(
        (project) =>
          matchesLayout(project, layoutFilter) && matchesSearch(project, searchQuery.trim()),
      ),
    [data, layoutFilter, searchQuery],
  );

  const quickCounts = useMemo(
    () => ({
      all: summary?.total ?? total,
      new: data.filter((project) => project.is_new_listing).length,
      price: data.filter((project) => Boolean(project.latest_price_change)).length,
      draft: summary?.draft ?? data.filter((project) => project.publish_status === "草稿").length,
    }),
    [data, summary, total],
  );

  const hasActiveFilters =
    publishTab !== "all" || saleTab !== "all" || badgeFilter !== "all" || layoutFilter !== "all";
  const isTotalEmpty = total === 0 && data.length === 0;

  const clearFilters = useCallback(() => {
    setPublishTab("all");
    setSaleTab("all");
    setBadgeFilter("all");
    setLayoutFilter("all");
    updateUrlParams({
      publish_status: undefined,
      project_status: undefined,
      badge_filter: undefined,
      layout: undefined,
    });
  }, [updateUrlParams]);

  const handleRowClick = useCallback(
    (project: L4MarketingProject) => router.push(`/admin/marketing/${project.id}`),
    [router],
  );

  return (
    <section className="overflow-hidden rounded-cards bg-white shadow-steep-sm">
      <div className="flex flex-col gap-4 px-6 pt-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full max-w-[360px]">
          <Search className="pointer-events-none absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2 text-dove" />
          <Input
            value={searchQuery}
            onChange={(event) => startTransition(() => setSearchQuery(event.target.value))}
            placeholder="搜索房源名称、小区、户型..."
            className="h-11 rounded-inputs border-0 bg-fog pr-10 pl-11 text-sm shadow-none focus-visible:ring-1 focus-visible:ring-ink/20"
          />
          {searchQuery ? (
            <button
              type="button"
              aria-label="清空搜索"
              onClick={() => setSearchQuery("")}
              className="absolute top-1/2 right-3 -translate-y-1/2 rounded-full p-1 text-graphite hover:bg-white"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 rounded-full bg-fog p-1">
            <button
              type="button"
              onClick={() => setViewMode("table")}
              aria-label="表格视图"
              className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors ${
                viewMode === "table" ? "bg-ink text-white" : "text-graphite hover:text-ink"
              }`}
            >
              <List className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode("gallery")}
              aria-label="画廊视图"
              className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors ${
                viewMode === "gallery" ? "bg-ink text-white" : "text-graphite hover:text-ink"
              }`}
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-3 border-t border-dove/30 px-6 pt-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap items-center gap-1 rounded-full bg-fog p-1">
            {QUICK_FILTERS.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => setQuickFilter(item.value)}
                className={`inline-flex h-8 items-center gap-2 rounded-full px-3 text-xs font-medium transition-all ${
                  activeQuick === item.value ? "bg-ink text-white" : "text-graphite hover:text-ink"
                }`}
              >
                {item.label}
                <span
                  className={`tabular-nums ${
                    activeQuick === item.value ? "text-white/55" : "text-dove"
                  }`}
                >
                  {quickCounts[item.value]}
                </span>
              </button>
            ))}
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <SlidersHorizontal className="h-3.5 w-3.5 text-dove" />
            <select
              aria-label="发布状态"
              value={publishTab}
              onChange={(event) => handlePublishChange(event.target.value)}
              className="h-9 rounded-full border border-dove/50 bg-white px-3 text-xs font-medium text-ash outline-none focus:ring-1 focus:ring-ink/20"
            >
              <option value="all">全部发布状态</option>
              <option value="发布">已发布</option>
              <option value="草稿">草稿</option>
            </select>
            <select
              aria-label="项目状态"
              value={saleTab}
              onChange={(event) => handleSaleChange(event.target.value)}
              className="h-9 rounded-full border border-dove/50 bg-white px-3 text-xs font-medium text-ash outline-none focus:ring-1 focus:ring-ink/20"
            >
              <option value="all">全部项目状态</option>
              <option value="在途">在途</option>
              <option value="在售">在售</option>
              <option value="已售">已售</option>
            </select>
            <select
              aria-label="户型"
              value={layoutFilter}
              onChange={(event) => setLayoutFilter(event.target.value)}
              className="h-9 rounded-full border border-dove/50 bg-white px-3 text-xs font-medium text-ash outline-none focus:ring-1 focus:ring-ink/20"
            >
              <option value="all">全部户型</option>
              <option value="1">1室</option>
              <option value="2">2室</option>
              <option value="3">3室</option>
              <option value="other">4室及以上</option>
            </select>
          </div>
        </div>

        {hasActiveFilters ? (
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-graphite">
            <span>已筛选</span>
            {publishTab !== "all" ? (
              <FilterChip label={`发布 · ${publishTab}`} onRemove={() => handlePublishChange("all")} />
            ) : null}
            {saleTab !== "all" ? (
              <FilterChip label={`项目 · ${saleTab}`} onRemove={() => handleSaleChange("all")} />
            ) : null}
            {badgeFilter !== "all" ? (
              <FilterChip
                label={badgeFilter === "new" ? "新上房源" : "近期调价"}
                onRemove={() => setQuickFilter("all")}
              />
            ) : null}
            {layoutFilter !== "all" ? (
              <FilterChip
                label={`户型 · ${layoutFilter === "other" ? "4室+" : `${layoutFilter}室`}`}
                onRemove={() => setLayoutFilter("all")}
              />
            ) : null}
            <button
              type="button"
              onClick={clearFilters}
              className="text-[11px] font-medium text-rust hover:underline"
            >
              清除全部
            </button>
          </div>
        ) : null}
      </div>

      {filteredData.length === 0 ? (
        <div className="flex min-h-[320px] flex-col items-center justify-center px-6 py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-fog text-graphite">
            <Search className="h-6 w-6" />
          </div>
          <h3 className="mt-5 font-display text-[26px] text-ink">
            {isTotalEmpty ? "还没有营销房源" : "没有匹配的房源"}
          </h3>
          <p className="mt-2 max-w-[320px] text-sm leading-relaxed text-graphite">
            {isTotalEmpty
              ? "创建第一套营销房源，把资料、发布状态与价格变化放到同一处管理。"
              : "调整搜索或筛选条件，或者创建一套新的营销房源。"}
          </p>
          <div className="mt-5 flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="rounded-full border-dove bg-white text-ink hover:bg-fog"
              onClick={() => {
                setSearchQuery("");
                clearFilters();
              }}
            >
              清除筛选
            </Button>
            <Link
              href="/admin/marketing/new"
              className="inline-flex h-10 items-center gap-2 rounded-full bg-ink px-4 text-sm font-medium text-white"
            >
              <Plus className="h-4 w-4" />
              新建房源
            </Link>
          </div>
        </div>
      ) : viewMode === "table" ? (
        <div className="mt-4 overflow-x-auto">
          <div className="min-w-[1000px]">
            <div className="grid grid-cols-[minmax(300px,2.1fr)_120px_118px_140px_126px_100px_24px] items-center gap-4 border-y border-dove/30 bg-fog/60 px-6 py-2.5 text-[10px] font-medium uppercase tracking-[0.08em] text-graphite">
              <span>房源</span>
              <span>营销状态</span>
              <span>户型 / 面积</span>
              <span className="pr-6 text-right">总价 / 单价</span>
              <span>浏览</span>
              <span>最近更新</span>
              <span />
            </div>
            <div className="divide-y divide-dove/20">
              {filteredData.map((project) => (
                <div
                  key={project.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleRowClick(project)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      handleRowClick(project);
                    }
                  }}
                  className="grid grid-cols-[minmax(300px,2.1fr)_120px_118px_140px_126px_100px_24px] items-center gap-4 px-6 py-4 transition-colors hover:bg-fog/50 focus-visible:bg-fog/60 focus-visible:outline-none"
                >
                  <div className="flex min-w-0 items-center gap-4">
                    <div className="relative h-14 w-[72px] shrink-0 overflow-hidden rounded-images bg-fog">
                      {getProjectImage(project) ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={getProjectImage(project)!}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-dove">
                          <ImageOff className="h-5 w-5" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-[14px] font-medium tracking-[-0.01em] text-ink">
                          {project.title || "未命名房源"}
                        </span>
                        {project.is_new_listing ? (
                          <span className="shrink-0 rounded-full bg-ink px-2 py-0.5 text-[10px] font-medium text-white">
                            新上
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-1.5 flex items-center gap-2 text-[11px] text-graphite">
                        <span className="truncate">{project.community_name || "未知小区"}</span>
                        <span className="text-dove">·</span>
                        <span className="shrink-0">ID {project.id}</span>
                        {project.dict_status === "pending" ? (
                          <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] text-amber-800">
                            未审核
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col items-start gap-1.5">
                    <PublishBadge project={project} />
                    <SaleBadge status={project.project_status} />
                  </div>

                  <div className="text-[13px] text-ash">
                    <div>{project.layout || "—"}</div>
                    <div className="mt-0.5 text-[11px] text-graphite">{formatArea(project.area)}</div>
                  </div>

                  <div className="pr-6 text-right">
                    <div className="text-[14px] font-medium tracking-[-0.01em] text-ink tabular-nums">
                      {formatPrice(project.total_price)}
                    </div>
                    <div className="mt-0.5 text-[11px] text-graphite tabular-nums">
                      {formatUnitPrice(project.unit_price)}
                    </div>
                    {project.latest_price_change ? (
                      <div className="mt-1 text-[10px] text-rust">
                        近期调价 {safeFormatDate(project.latest_price_change.changed_at, "MM.dd")}
                      </div>
                    ) : null}
                  </div>

                  <div className="text-[13px] text-ash tabular-nums">
                    <div>{project.view_summary?.view_count?.toLocaleString() ?? "—"} 次浏览</div>
                    <div className="mt-0.5 text-[11px] text-graphite">
                      {project.view_summary?.visitor_count?.toLocaleString() ?? "—"} 位访客
                    </div>
                  </div>

                  <div className="text-[12px] text-graphite tabular-nums">
                    {safeFormatDate(project.updated_at, "MM.dd")}
                    <div className="mt-0.5 text-[10px] text-dove">
                      {safeFormatDate(project.updated_at, "HH:mm")}
                    </div>
                  </div>

                  <ChevronRight className="h-4 w-4 text-dove" />
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-4 grid gap-4 px-6 pb-2 sm:grid-cols-2 xl:grid-cols-4">
          {filteredData.map((project) => (
            <button
              key={project.id}
              type="button"
              onClick={() => handleRowClick(project)}
              className="group overflow-hidden rounded-cards border border-dove/30 bg-white text-left transition-shadow hover:shadow-steep-sm focus-visible:ring-2 focus-visible:ring-ink/20 focus-visible:outline-none"
            >
              <div className="relative aspect-[4/3] overflow-hidden bg-fog">
                {getProjectImage(project) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={getProjectImage(project)!}
                    alt=""
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-dove">
                    <ImageOff className="h-7 w-7" />
                  </div>
                )}
                <div className="absolute top-3 left-3 flex gap-1.5">
                  <PublishBadge project={project} />
                  {project.is_new_listing ? (
                    <span className="inline-flex h-6 items-center rounded-full bg-ink px-2.5 text-[11px] font-medium text-white">
                      新上
                    </span>
                  ) : null}
                </div>
                <div className="absolute right-3 bottom-3 rounded-full bg-ink/75 px-2.5 py-1 text-[10px] text-white tabular-nums">
                  {project.view_summary?.view_count?.toLocaleString() ?? 0} 次浏览
                </div>
              </div>
              <div className="p-4">
                <div className="truncate text-[15px] font-medium tracking-[-0.01em] text-ink">
                  {project.title || "未命名房源"}
                </div>
                <div className="mt-1.5 truncate text-[11px] text-graphite">
                  {project.community_name || "未知小区"} · {project.layout || "—"} ·{" "}
                  {formatArea(project.area)}
                </div>
                <div className="mt-3 flex items-end justify-between">
                  <div>
                    <div className="text-[16px] font-medium text-rust tabular-nums">
                      {formatPrice(project.total_price)}
                    </div>
                    <div className="mt-0.5 text-[10px] text-graphite tabular-nums">
                      {formatUnitPrice(project.unit_price)}
                    </div>
                  </div>
                  <SaleBadge status={project.project_status} />
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      <div className="border-t border-dove/30 px-6 py-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-[11px] text-graphite">
            共 <b className="font-medium text-ash">{total}</b> 套房源，当前展示{" "}
            <b className="font-medium text-ash">{filteredData.length}</b> 套
          </div>
          <MarketingPagination total={total} />
        </div>
      </div>
    </section>
  );
}

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex h-6 items-center gap-1 rounded-full bg-apricot-wash px-2.5 text-[11px] text-rust">
      {label}
      <button type="button" aria-label={`移除${label}`} onClick={onRemove} className="hover:opacity-70">
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}
