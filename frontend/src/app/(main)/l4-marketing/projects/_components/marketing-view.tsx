"use client";

import { useState, useMemo, useTransition, useCallback, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, X, Download } from "lucide-react";
import { toast } from "sonner";
import { DataTable } from "@/components/ui/data-table";
import { columns } from "../columns";
import { L4MarketingProject } from "../types";
import { MarketingDetailSheet } from "./marketing-detail-sheet";
import { Pagination } from "./pagination";
import Link from "next/link";
import { Plus } from "lucide-react";

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

  const layoutTabs = [
    { value: "all", label: "全部" },
    { value: "1", label: "1室" },
    { value: "2", label: "2室" },
    { value: "3", label: "3室" },
    { value: "other", label: "其他" },
  ];

  return (
    <div className="space-y-4">
      {/* --- Top Toolbar --- */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        {/* Left: Filter Area */}
        <div className="flex flex-col sm:flex-row w-full lg:w-auto gap-3 items-center">
          {/* Search Input */}
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="搜索房源名称..."
              value={searchQuery}
              onChange={handleSearchChange}
              className="pl-9 pr-9 bg-white border-slate-200 focus-visible:ring-blue-600"
            />
            {searchQuery ? (
              <button
                onClick={handleClearSearch}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="h-3 w-3" />
              </button>
            ) : null}
          </div>

          {/* Layout Tabs */}
          <div className="flex p-1 bg-slate-100/50 rounded-lg">
            {layoutTabs.map((tab) => (
              <button
                key={tab.value}
                onClick={() => handleLayoutChange(tab.value)}
                className={`py-1.5 px-3 text-xs font-medium rounded-md transition-all whitespace-nowrap ${
                  layoutFilter === tab.value
                    ? "bg-white text-slate-800 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Status Tabs */}
          <Tabs
            value={activeTab}
            onValueChange={(val) => handleTabChange(val as keyof typeof STATUS_FILTERS)}
            className="w-full sm:w-auto"
          >
            <TabsList className="h-10 bg-slate-100/50 p-1 rounded-lg">
              <TabsTrigger value="all" className="text-xs px-3">
                全部
              </TabsTrigger>
              <TabsTrigger
                value="in_progress"
                className="text-xs px-3 data-[state=active]:bg-blue-100 data-[state=active]:text-blue-800"
              >
                在途
              </TabsTrigger>
              <TabsTrigger
                value="for_sale"
                className="text-xs px-3 data-[state=active]:bg-emerald-100 data-[state=active]:text-emerald-800"
              >
                在售
              </TabsTrigger>
              <TabsTrigger
                value="sold"
                className="text-xs px-3 data-[state=active]:bg-slate-200 data-[state=active]:text-slate-800"
              >
                已售
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Right: Actions */}
        <div className="flex w-full lg:w-auto gap-3">
          <Button
            variant="outline"
            className="flex-1 lg:flex-none bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
            onClick={() => toast.success("正在生成报表...")}
          >
            <Download className="mr-2 h-4 w-4" />
            导出
          </Button>

          <div className="flex-1 lg:flex-none">
            <Link
              href="/l4-marketing/projects/new"
              className="inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2 bg-blue-600 text-white hover:bg-blue-700"
            >
              <Plus className="mr-2 h-4 w-4" />
              新建房源
            </Link>
          </div>
        </div>
      </div>

      {/* --- Table Area --- */}
      <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <DataTable
            columns={columns}
            data={filteredData}
            onRowClick={handleRowClick}
          />
        </div>
      </div>

      {/* Footer Info */}
      <div className="flex items-center justify-between text-xs text-slate-400 px-1">
        <span>
          显示 {filteredData.length} 条记录 (共 {total} 条)
        </span>
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
