"use client";

import { useState, useMemo } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Download, Search, X, Plus } from "lucide-react";
import { toast } from "sonner";
import { DataTable } from "@/components/ui/data-table";
import { columns } from "../columns";
import { L4MarketingProject } from "../types";
import Link from "next/link";
import { SyncButton } from "../sync-button";

interface MarketingViewProps {
  data: L4MarketingProject[];
  total: number;
}

export function MarketingView({ data, total }: MarketingViewProps) {
  // 1. Local State for Filtering
  const [activeTab, setActiveTab] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  // 2. Client-side Filtering Logic
  const filteredData = useMemo(() => {
    return data.filter((project) => {
      // Status Filter
      let statusMatch = true;
      if (activeTab === "published") {
        statusMatch = project.is_published === true;
      } else if (activeTab === "draft") {
        statusMatch = project.is_published === false;
      } else if (activeTab === "for_sale") {
        statusMatch = project.project_status === "在售";
      } else if (activeTab === "sold") {
        statusMatch = project.project_status === "已售";
      }

      // Search Filter
      const searchLower = searchQuery.toLowerCase().trim();
      const searchMatch =
        !searchLower ||
        project.title?.toLowerCase().includes(searchLower) ||
        project.address?.toLowerCase().includes(searchLower);

      return statusMatch && searchMatch;
    });
  }, [data, activeTab, searchQuery]);

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
              placeholder="搜索项目名称、地址..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-9 bg-white border-slate-200 focus-visible:ring-blue-600"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          {/* Status Tabs */}
          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            className="w-full sm:w-auto"
          >
            <TabsList className="h-10 bg-slate-100/50 p-1 rounded-lg">
              <TabsTrigger value="all" className="text-xs px-3">
                全部
              </TabsTrigger>
              <TabsTrigger
                value="published"
                className="text-xs px-3 data-[state=active]:bg-emerald-100 data-[state=active]:text-emerald-800"
              >
                已发布
              </TabsTrigger>
              <TabsTrigger
                value="draft"
                className="text-xs px-3 data-[state=active]:bg-amber-100 data-[state=active]:text-amber-800"
              >
                草稿
              </TabsTrigger>
              <TabsTrigger
                value="for_sale"
                className="text-xs px-3 data-[state=active]:bg-blue-100 data-[state=active]:text-blue-800"
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
          <SyncButton />
          <Button
            variant="outline"
            className="flex-1 lg:flex-none bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
            onClick={() => toast.success("正在生成报表...")}
          >
            <Download className="mr-2 h-4 w-4" />
            导出
          </Button>

          <Button asChild className="flex-1 lg:flex-none">
            <Link href="/minipro/projects/new">
              <Plus className="mr-2 h-4 w-4" />
              新建独立项目
            </Link>
          </Button>
        </div>
      </div>

      {/* --- Table Area --- */}
      <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <DataTable columns={columns} data={filteredData} />
        </div>
      </div>

      {/* Footer Info */}
      <div className="flex items-center justify-between text-xs text-slate-400 px-1">
        <span>
          显示 {filteredData.length} 条记录 (共 {total} 条)
        </span>
      </div>
    </div>
  );
}
