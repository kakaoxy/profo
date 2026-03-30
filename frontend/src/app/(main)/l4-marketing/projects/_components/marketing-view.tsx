"use client";

import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Download, Search, X, Plus, LayoutGrid, List } from "lucide-react";
import { DataTable } from "@/components/ui/data-table";
import { columns } from "../columns";
import { L4MarketingProject } from "../types";
import Link from "next/link";
import { MarketingDetailSheet } from "./marketing-detail-sheet";

interface MarketingViewProps {
  data: L4MarketingProject[];
  total: number;
}

export function MarketingView({ data, total }: MarketingViewProps) {
  // 1. Local State for Filtering
  const [activeTab, setActiveTab] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [layoutFilter, setLayoutFilter] = useState("all");

  // 模态框状态
  const [selectedProject, setSelectedProject] = useState<L4MarketingProject | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);

  // 2. Client-side Filtering Logic
  const filteredData = useMemo(() => {
    return data.filter((project) => {
      // Status Filter
      let statusMatch = true;
      if (activeTab === "published") {
        statusMatch = project.publish_status === "发布";
      } else if (activeTab === "draft") {
        statusMatch = project.publish_status === "草稿";
      } else if (activeTab === "for_sale") {
        statusMatch = project.project_status === "在售";
      } else if (activeTab === "sold") {
        statusMatch = project.project_status === "已售";
      } else if (activeTab === "in_progress") {
        statusMatch = project.project_status === "在途";
      }

      // Layout Filter
      let layoutMatch = true;
      if (layoutFilter !== "all" && project.layout) {
        const roomCount = project.layout.match(/(\d+)室/);
        if (roomCount) {
          if (layoutFilter === "other") {
            layoutMatch = parseInt(roomCount[1]) >= 4;
          } else {
            layoutMatch = roomCount[1] === layoutFilter;
          }
        }
      }

      // Search Filter
      const searchLower = searchQuery.toLowerCase().trim();
      const searchMatch =
        !searchLower ||
        project.title?.toLowerCase().includes(searchLower) ||
        project.layout?.toLowerCase().includes(searchLower) ||
        project.orientation?.toLowerCase().includes(searchLower) ||
        project.community_name?.toLowerCase().includes(searchLower);

      return statusMatch && layoutMatch && searchMatch;
    });
  }, [data, activeTab, layoutFilter, searchQuery]);

  // 处理行点击 - 打开详情页
  const handleRowClick = (row: L4MarketingProject) => {
    setSelectedProject(row);
    setIsSheetOpen(true);
  };

  const statusTabs = [
    { value: "all", label: "全部" },
    { value: "in_progress", label: "在途" },
    { value: "for_sale", label: "在售" },
    { value: "sold", label: "已售" },
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
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-11 pr-10 py-3 bg-white border-none rounded-xl shadow-sm focus-visible:ring-2 focus-visible:ring-[#005daa]/20 text-sm placeholder:text-[#707785]/60"
              />
              {searchQuery ? (
                <button
                  onClick={() => setSearchQuery("")}
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
                  onClick={() => setActiveTab(tab.value)}
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
                  setActiveTab(val);
                } else {
                  setActiveTab("all");
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
                  onClick={() => setLayoutFilter(tab.value)}
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
      <div className="bg-white rounded-3xl border border-[#c0c7d6]/20 shadow-sm overflow-hidden">
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
