"use client";

import { useState, useMemo, useTransition, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Search, X } from "lucide-react";
import { DataTable } from "@/components/ui/data-table";
import { columns } from "../columns";
import { L4MarketingProject } from "../types";
import { MarketingDetailSheet } from "./marketing-detail-sheet";

// 提取常量到模块级别，避免每次渲染重新创建
const ROOM_COUNT_REGEX = /(\d+)室/;

interface MarketingViewProps {
  data: L4MarketingProject[];
  total: number;
}

// 状态过滤器配置
const STATUS_FILTERS = {
  published: (p: L4MarketingProject) => p.publish_status === "发布",
  draft: (p: L4MarketingProject) => p.publish_status === "草稿",
  for_sale: (p: L4MarketingProject) => p.project_status === "在售",
  sold: (p: L4MarketingProject) => p.project_status === "已售",
  in_progress: (p: L4MarketingProject) => p.project_status === "在途",
  all: () => true,
} as const;

// 户型过滤器配置
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

// 搜索过滤器
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
  // 1. Local State for Filtering
  const [activeTab, setActiveTab] = useState<keyof typeof STATUS_FILTERS>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [layoutFilter, setLayoutFilter] = useState("all");

  // 使用 useTransition 优化过滤性能，保持输入响应
  const [isPending, startTransition] = useTransition();

  // 模态框状态
  const [selectedProject, setSelectedProject] = useState<L4MarketingProject | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);

  // 2. Memoized Filter Functions
  const statusFilterFn = useMemo(() => STATUS_FILTERS[activeTab], [activeTab]);
  const layoutFilterFn = useMemo(() => createLayoutFilter(layoutFilter), [layoutFilter]);
  const searchFilterFn = useMemo(() => createSearchFilter(searchQuery), [searchQuery]);

  // 3. Client-side Filtering Logic with Transition
  const filteredData = useMemo(() => {
    return data.filter((project) => {
      return statusFilterFn(project) && layoutFilterFn(project) && searchFilterFn(project);
    });
  }, [data, statusFilterFn, layoutFilterFn, searchFilterFn]);

  // 处理标签切换 - 使用 transition
  const handleTabChange = useCallback((tab: keyof typeof STATUS_FILTERS) => {
    startTransition(() => {
      setActiveTab(tab);
    });
  }, []);

  // 处理户型过滤切换 - 使用 transition
  const handleLayoutChange = useCallback((layout: string) => {
    startTransition(() => {
      setLayoutFilter(layout);
    });
  }, []);

  // 处理搜索 - 使用 transition
  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    startTransition(() => {
      setSearchQuery(value);
    });
  }, []);

  // 清除搜索
  const handleClearSearch = useCallback(() => {
    startTransition(() => {
      setSearchQuery("");
    });
  }, []);

  // 处理行点击 - 打开详情页
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
      <div className={`bg-white rounded-3xl border border-[#c0c7d6]/20 shadow-sm overflow-hidden ${isPending ? "opacity-70" : ""}`}>
        <div className="overflow-x-auto">
          <DataTable
            columns={columns}
            data={filteredData}
            onRowClick={handleRowClick}
          />
        </div>

        {/* Pagination */}
        <div className="px-8 py-5 bg-[#eff4ff]/50 flex items-center justify-between border-t border-[#c0c7d6]/10">
          <div className="text-xs text-[#707785] font-medium">
            显示 <span className="text-[#0b1c30]">1 - {Math.min(filteredData.length, 10)}</span> 之 <span className="text-[#0b1c30]">{total}</span> 个房源
          </div>
          <div className="flex items-center gap-1">
            <button className="w-9 h-9 flex items-center justify-center rounded-lg border border-[#c0c7d6]/30 text-[#707785] hover:bg-[#eff4ff] hover:text-[#005daa] transition-all">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
            </button>
            <button className="w-9 h-9 flex items-center justify-center rounded-lg bg-[#005daa] text-white font-bold shadow-md shadow-[#005daa]/20">1</button>
            <button className="w-9 h-9 flex items-center justify-center rounded-lg text-[#707785] hover:bg-[#eff4ff] transition-all">2</button>
            <button className="w-9 h-9 flex items-center justify-center rounded-lg text-[#707785] hover:bg-[#eff4ff] transition-all">3</button>
            <span className="px-2 text-[#707785]">...</span>
            <button className="w-9 h-9 flex items-center justify-center rounded-lg border border-[#c0c7d6]/30 text-[#707785] hover:bg-[#eff4ff] hover:text-[#005daa] transition-all">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
            </button>
          </div>
        </div>
      </div>

      {/* 详情模态框 */}
      <MarketingDetailSheet
        key={selectedProject?.id}
        project={selectedProject}
        isOpen={isSheetOpen}
        onClose={() => setIsSheetOpen(false)}
      />
    </div>
  );
}
