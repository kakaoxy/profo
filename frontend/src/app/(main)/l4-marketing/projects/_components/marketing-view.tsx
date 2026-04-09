"use client";

import { useState, useMemo, useTransition, useCallback, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Search, X, Loader2 } from "lucide-react";
import { DataTable } from "@/components/ui/data-table";
import { columns } from "../columns";
import { L4MarketingProject } from "../types";
import { MarketingDetailSheet } from "./marketing-detail-sheet";
import { Pagination } from "./pagination";
import { cn } from "@/lib/utils";

const ROOM_COUNT_REGEX = /(\d+)室/;

interface MarketingViewProps {
  data: L4MarketingProject[];
  total: number;
  currentPage: number;
  pageSize: number;
}

const STATUS_FILTERS = {
  published: (p: L4MarketingProject) => p.publish_status === "发布",
  draft: (p: L4MarketingProject) => p.publish_status === "草稿",
  for_sale: (p: L4MarketingProject) => p.project_status === "在售",
  sold: (p: L4MarketingProject) => p.project_status === "已售",
  in_progress: (p: L4MarketingProject) => p.project_status === "在途",
  all: () => true,
} as const;

const createLayoutFilter = (layoutFilter: string) => {
  if (layoutFilter === "all") return () => true;

  return (project: L4MarketingProject) => {
    if (!project.layout) return false;
    const roomCount = project.layout.match(ROOM_COUNT_REGEX);
    if (!roomCount) return false;

    const roomNum = parseInt(roomCount[1]);
    if (layoutFilter === "other") {
      return roomNum >= 4;
    }
    return roomCount[1] === layoutFilter;
  };
};

const createSearchFilter = (searchQuery: string) => {
  const searchLower = searchQuery.toLowerCase().trim();
  if (!searchLower) return () => true;

  return (project: L4MarketingProject) =>
    project.title?.toLowerCase().includes(searchLower) ||
    project.layout?.toLowerCase().includes(searchLower) ||
    project.orientation?.toLowerCase().includes(searchLower) ||
    project.community_name?.toLowerCase().includes(searchLower);
};

export function MarketingView({ data, total, currentPage, pageSize }: MarketingViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [activeTab, setActiveTab] = useState<keyof typeof STATUS_FILTERS>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [layoutFilter, setLayoutFilter] = useState("all");
  const [isPending, startTransition] = useTransition();
  const [isPageLoading, setIsPageLoading] = useState(false);

  const [selectedProject, setSelectedProject] = useState<L4MarketingProject | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);

  const statusFilterFn = useMemo(() => STATUS_FILTERS[activeTab], [activeTab]);
  const layoutFilterFn = useMemo(() => createLayoutFilter(layoutFilter), [layoutFilter]);
  const searchFilterFn = useMemo(() => createSearchFilter(searchQuery), [searchQuery]);

  const filteredData = useMemo(() => {
    return data.filter((project) => {
      return statusFilterFn(project) && layoutFilterFn(project) && searchFilterFn(project);
    });
  }, [data, statusFilterFn, layoutFilterFn, searchFilterFn]);

  const totalPages = Math.ceil(total / pageSize);

  // 当页面变化时重置加载状态
  useEffect(() => {
    setIsPageLoading(false);
  }, [currentPage]);

  const handlePageChange = useCallback((page: number) => {
    if (page < 1 || page > totalPages || page === currentPage) return;

    setIsPageLoading(true);
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", page.toString());
    router.push(`/l4-marketing/projects?${params.toString()}`);
  }, [currentPage, totalPages, searchParams, router]);

  const handleTabChange = useCallback((tab: keyof typeof STATUS_FILTERS) => {
    startTransition(() => {
      setActiveTab(tab);
    });
  }, []);

  const handleLayoutChange = useCallback((layout: string) => {
    startTransition(() => {
      setLayoutFilter(layout);
    });
  }, []);

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    startTransition(() => {
      setSearchQuery(value);
    });
  }, []);

  const handleClearSearch = useCallback(() => {
    startTransition(() => {
      setSearchQuery("");
    });
  }, []);

  const handleRowClick = useCallback((row: L4MarketingProject) => {
    setSelectedProject(row);
    setIsSheetOpen(true);
  }, []);

  const statusTabs = [
    { value: "all" as const, label: "全部" },
    { value: "in_progress" as const, label: "在途" },
    { value: "for_sale" as const, label: "在售" },
    { value: "sold" as const, label: "已售" },
  ];

  const layoutTabs = [
    { value: "all", label: "全部" },
    { value: "1", label: "1室" },
    { value: "2", label: "2室" },
    { value: "3", label: "3室" },
    { value: "other", label: "其他" },
  ];

  return (
    <div className="space-y-6">
      {/* --- Bento Filter Card --- */}
      <section className="bg-[#eff4ff] rounded-2xl p-6">
        <div className="grid grid-cols-12 gap-6">
          {/* Search Bar */}
          <div className="col-span-12 lg:col-span-4">
            <label className="block text-xs font-bold uppercase tracking-wider text-[#707785] mb-2">
              搜索房源
            </label>
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-[#005daa]" />
              <Input
                placeholder="搜索房源名称、小区或房源ID..."
                value={searchQuery}
                onChange={handleSearchChange}
                className="pl-11 pr-10 py-3 bg-white border-none rounded-xl shadow-sm focus-visible:ring-2 focus-visible:ring-[#005daa]/20 text-sm placeholder:text-[#707785]/60"
              />
              {searchQuery ? (
                <button
                  onClick={handleClearSearch}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#707785] hover:text-[#0b1c30] p-1"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : null}
            </div>
          </div>

          {/* Project Status Filter */}
          <div className="col-span-12 lg:col-span-4">
            <label className="block text-xs font-bold uppercase tracking-wider text-[#707785] mb-2">
              项目状态
            </label>
            <div className="flex p-1 bg-white rounded-xl shadow-sm">
              {statusTabs.map((tab) => (
                <button
                  key={tab.value}
                  onClick={() => handleTabChange(tab.value)}
                  className={`flex-1 py-2 px-3 text-xs font-bold rounded-lg transition-all ${
                    activeTab === tab.value
                      ? "bg-[#005daa] text-white shadow-sm"
                      : "text-[#707785] hover:bg-[#eff4ff]"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Publish Status Filter */}
          <div className="col-span-12 lg:col-span-2">
            <label className="block text-xs font-bold uppercase tracking-wider text-[#707785] mb-2">
              发布状态
            </label>
            <select
              className="w-full px-4 py-3 bg-white border-none rounded-xl shadow-sm focus:ring-2 focus:ring-[#005daa]/20 appearance-none font-body text-sm text-[#0b1c30] cursor-pointer"
              value={activeTab === "published" ? "published" : activeTab === "draft" ? "draft" : "all"}
              onChange={(e) => {
                const val = e.target.value;
                if (val === "published" || val === "draft") {
                  handleTabChange(val);
                } else {
                  handleTabChange("all");
                }
              }}
            >
              <option value="all">全部状态</option>
              <option value="draft">草稿</option>
              <option value="published">已发布</option>
            </select>
          </div>

          {/* Layout Tabs Filter */}
          <div className="col-span-12 lg:col-span-2">
            <label className="block text-xs font-bold uppercase tracking-wider text-[#707785] mb-2">
              户型
            </label>
            <div className="flex p-1 bg-white rounded-xl shadow-sm overflow-x-auto">
              {layoutTabs.map((tab) => (
                <button
                  key={tab.value}
                  onClick={() => handleLayoutChange(tab.value)}
                  className={`flex-1 py-2 px-2 text-xs font-bold rounded-lg transition-all whitespace-nowrap ${
                    layoutFilter === tab.value
                      ? "bg-[#005daa] text-white shadow-sm"
                      : "text-[#707785] hover:bg-[#eff4ff]"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* --- Table Area --- */}
      <div className={cn(
        "bg-white rounded-3xl border border-[#c0c7d6]/20 shadow-sm overflow-hidden relative",
        (isPending || isPageLoading) && "opacity-70"
      )}>
        {(isPending || isPageLoading) && (
          <div className="absolute inset-0 bg-white/50 flex items-center justify-center z-10">
            <Loader2 className="h-8 w-8 animate-spin text-[#005daa]" />
          </div>
        )}
        <div className="overflow-x-auto">
          <DataTable
            columns={columns}
            data={filteredData}
            onRowClick={handleRowClick}
          />
        </div>

        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          total={total}
          pageSize={pageSize}
          isLoading={isPageLoading}
          onPageChange={handlePageChange}
        />
      </div>

      <MarketingDetailSheet
        key={selectedProject?.id}
        project={selectedProject}
        isOpen={isSheetOpen}
        onClose={() => setIsSheetOpen(false)}
      />
    </div>
  );
}
