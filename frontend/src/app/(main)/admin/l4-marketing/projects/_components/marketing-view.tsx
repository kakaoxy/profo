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
import { L4MarketingProject } from "@/app/(main)/admin/l4-marketing/projects/types";
import { MarketingDetailSheet } from "./marketing-detail-sheet";
import Link from "next/link";
import { Plus } from "lucide-react";

const ROOM_COUNT_REGEX = /(\d+)室/;

interface MarketingViewProps {
  data: L4MarketingProject[];
  total: number;
}

// 发布状态 Tab：value 直接对应后端 publish_status 参数值
const PUBLISH_TABS = [
  { value: "all", label: "全部" },
  { value: "发布", label: "已发布" },
  { value: "草稿", label: "草稿" },
] as const;

// 项目状态 Tab：value 直接对应后端 project_status 参数值
const PROJECT_STATUS_TABS = [
  { value: "all", label: "全部" },
  { value: "在途", label: "在途" },
  { value: "在售", label: "在售" },
  { value: "已售", label: "已售" },
] as const;

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

export function MarketingView({ data, total }: MarketingViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // 从 URL 读取初始状态（两组 Tab 独立）
  const initialPublishTab = searchParams.get("publish_status") || "all";
  const initialProjectStatusTab = searchParams.get("project_status") || "all";
  const initialLayout = searchParams.get("layout") || "all";
  const initialSearch = searchParams.get("search") || "";

  const [publishTab, setPublishTab] = useState(initialPublishTab);
  const [projectStatusTab, setProjectStatusTab] = useState(initialProjectStatusTab);
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

    router.push(`/admin/l4-marketing/projects?${params.toString()}`);
  }, [searchParams, router]);

  const handlePublishTabChange = useCallback((value: string) => {
    setPublishTab(value);
    updateUrlParams({
      publish_status: value === "all" ? undefined : value,
    });
  }, [updateUrlParams]);

  const handleProjectStatusTabChange = useCallback((value: string) => {
    setProjectStatusTab(value);
    updateUrlParams({
      project_status: value === "all" ? undefined : value,
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
              value={publishTab}
              onValueChange={handlePublishTabChange}
              className="w-full sm:w-auto"
            >
              <TabsList className="h-10 bg-muted p-1 rounded-lg">
                {PUBLISH_TABS.map((tab) => (
                  <TabsTrigger
                    key={tab.value}
                    value={tab.value}
                    className="text-xs px-3 data-[state=active]:bg-primary/10 data-[state=active]:text-primary"
                  >
                    {tab.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>

            <Tabs
              value={projectStatusTab}
              onValueChange={handleProjectStatusTabChange}
              className="w-full sm:w-auto"
            >
              <TabsList className="h-10 bg-muted p-1 rounded-lg">
                {PROJECT_STATUS_TABS.map((tab) => (
                  <TabsTrigger
                    key={tab.value}
                    value={tab.value}
                    className={`text-xs px-3 ${
                      tab.value === "在途"
                        ? "data-[state=active]:bg-primary/10 data-[state=active]:text-primary"
                        : tab.value === "在售"
                        ? "data-[state=active]:bg-emerald-100 data-[state=active]:text-emerald-800"
                        : tab.value === "已售"
                        ? "data-[state=active]:bg-muted data-[state=active]:text-foreground"
                        : ""
                    }`}
                  >
                    {tab.label}
                  </TabsTrigger>
                ))}
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
                href="/admin/l4-marketing/projects/new"
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
