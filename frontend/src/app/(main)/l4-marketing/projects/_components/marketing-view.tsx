"use client";

import { useState, useMemo, useTransition, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { DataTable } from "@/components/ui/data-table";
import { SearchBar, ListView } from "@/components/common";
import { columns } from "../columns";
import { L4MarketingProject } from "@/app/(main)/l4-marketing/projects/types";
import { MarketingDetailSheet } from "./marketing-detail-sheet";
import Link from "next/link";
import { Plus } from "lucide-react";

const ROOM_COUNT_REGEX = /(\d+)室/;

interface MarketingViewProps {
  data: L4MarketingProject[];
  total: number;
  currentPage: number;
  pageSize: number;
}

// 状态过滤映射：将前端 tab 值映射到后端 API 参数
const STATUS_FILTER_MAP: Record<string, { project_status?: string; publish_status?: string }> = {
  all: {},
  in_progress: { project_status: "在途" },
  for_sale: { project_status: "在售" },
  sold: { project_status: "已售" },
  published: { publish_status: "发布" },
  draft: { publish_status: "草稿" },
};

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

  // 从 URL 读取初始状态
  const initialTab = (searchParams.get("status_tab") as keyof typeof STATUS_FILTER_MAP) || "all";
  const initialLayout = searchParams.get("layout") || "all";
  const initialSearch = searchParams.get("search") || "";

  const [activeTab, setActiveTab] = useState<keyof typeof STATUS_FILTER_MAP>(initialTab);
  const [searchQuery, setSearchQuery] = useState(initialSearch);
  const [layoutFilter, setLayoutFilter] = useState(initialLayout);
  const [, startTransition] = useTransition();

  const [selectedProject, setSelectedProject] = useState<L4MarketingProject | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);

  // 客户端过滤（仅用于户型和搜索，状态过滤已移至服务端）
  const layoutFilterFn = useMemo(() => createLayoutFilter(layoutFilter), [layoutFilter]);
  const searchFilterFn = useMemo(() => createSearchFilter(searchQuery), [searchQuery]);

  const filteredData = useMemo(() => {
    return data.filter((project) => {
      return layoutFilterFn(project) && searchFilterFn(project);
    });
  }, [data, layoutFilterFn, searchFilterFn]);

  const totalPages = Math.ceil(total / pageSize);

  const updateUrlParams = useCallback((updates: Record<string, string | undefined>) => {
    const params = new URLSearchParams(searchParams.toString());
    
    Object.entries(updates).forEach(([key, value]) => {
      if (value === undefined || value === "" || value === "all") {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    });
    
    // 重置到第一页当过滤条件变化时
    params.set("page", "1");
    
    router.push(`/l4-marketing/projects?${params.toString()}`);
  }, [searchParams, router]);

  // _handlePageChange 保留供将来使用
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _handlePageChange = useCallback((page: number) => {
    if (page < 1 || page > totalPages || page === currentPage) return;

    const params = new URLSearchParams(searchParams.toString());
    params.set("page", page.toString());
    router.push(`/l4-marketing/projects?${params.toString()}`);
  }, [currentPage, totalPages, searchParams, router]);

  const handleTabChange = useCallback((tab: keyof typeof STATUS_FILTER_MAP) => {
    setActiveTab(tab);
    const filterParams = STATUS_FILTER_MAP[tab];
    updateUrlParams({
      status_tab: tab === "all" ? undefined : tab,
      project_status: filterParams.project_status,
      publish_status: filterParams.publish_status,
    });
  }, [updateUrlParams]);

  const handleLayoutChange = useCallback((layout: string) => {
    startTransition(() => {
      setLayoutFilter(layout);
    });
    // 户型过滤仍使用客户端过滤，不更新 URL
  }, []);

  const handleSearchChange = useCallback((value: string) => {
    setSearchQuery(value);
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
    <>
      <ListView
        searchBar={
          <SearchBar
            value={searchQuery}
            onChange={handleSearchChange}
            placeholder="搜索房源名称..."
          />
        }
        filterTabs={
          <>
            <div className="flex p-1 bg-muted rounded-lg">
              {layoutTabs.map((tab) => (
                <button
                  key={tab.value}
                  onClick={() => handleLayoutChange(tab.value)}
                  className={`py-1.5 px-3 text-xs font-medium rounded-md transition-all whitespace-nowrap ${
                    layoutFilter === tab.value
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <Tabs
              value={activeTab}
              onValueChange={(val) => handleTabChange(val as keyof typeof STATUS_FILTER_MAP)}
              className="w-full sm:w-auto"
            >
              <TabsList className="h-10 bg-muted p-1 rounded-lg">
                <TabsTrigger value="all" className="text-xs px-3">
                  全部
                </TabsTrigger>
                <TabsTrigger
                  value="in_progress"
                  className="text-xs px-3 data-[state=active]:bg-primary/10 data-[state=active]:text-primary"
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
                  className="text-xs px-3 data-[state=active]:bg-muted data-[state=active]:text-foreground"
                >
                  已售
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </>
        }
        actions={
          <>
            <Button
              variant="outline"
              className="flex-1 lg:flex-none bg-card border-border text-foreground hover:bg-muted"
              onClick={() => toast.success("正在生成报表...")}
            >
              <Download className="mr-2 h-4 w-4" />
              导出
            </Button>

            <div className="flex-1 lg:flex-none">
              <Link
                href="/l4-marketing/projects/new"
                className="inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2"
              >
                <Plus className="mr-2 h-4 w-4" />
                新建房源
              </Link>
            </div>
          </>
        }
        totalCount={total}
        filteredCount={filteredData.length}
      >
        <div className="bg-card rounded-lg border border-border shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <DataTable
              columns={columns}
              data={filteredData}
              onRowClick={handleRowClick}
            />
          </div>
        </div>
      </ListView>

      <MarketingDetailSheet
        key={selectedProject?.id}
        project={selectedProject}
        isOpen={isSheetOpen}
        onClose={() => setIsSheetOpen(false)}
      />
    </>
  );
}
