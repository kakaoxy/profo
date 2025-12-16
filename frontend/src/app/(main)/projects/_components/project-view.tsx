"use client";

import { useState, useMemo } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Download, Search, X } from "lucide-react";
import { toast } from "sonner";
import { DataTable } from "@/components/ui/data-table";
import { CreateProjectDialog } from "./create-project/index";
import { ProjectDetailSheet } from "./project-detail-sheet";
import { columns } from "./columns";
import { Project } from "../types";

interface ProjectViewProps {
  data: Project[];
  total: number;
}

export function ProjectView({ data, total }: ProjectViewProps) {
  // 1. Local State for Filtering
  const [activeTab, setActiveTab] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);

  // 2. Client-side Filtering Logic
  const filteredData = useMemo(() => {
    return data.filter((project) => {
      // Status Filter
      const statusMatch = activeTab === "all" || project.status === activeTab;

      // Search Filter
      const searchLower = searchQuery.toLowerCase().trim();
      const searchMatch =
        !searchLower ||
        project.community_name?.toLowerCase().includes(searchLower) ||
        project.name.toLowerCase().includes(searchLower);

      return statusMatch && searchMatch;
    });
  }, [data, activeTab, searchQuery]);

  const handleRowClick = (row: Project) => {
    setSelectedProject(row);
    setIsSheetOpen(true);
  };

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
              placeholder="搜索小区名称..."
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
                value="signing"
                className="text-xs px-3 data-[state=active]:bg-blue-100 data-[state=active]:text-blue-800"
              >
                签约
              </TabsTrigger>
              <TabsTrigger
                value="renovating"
                className="text-xs px-3 data-[state=active]:bg-orange-100 data-[state=active]:text-orange-800"
              >
                装修
              </TabsTrigger>
              <TabsTrigger
                value="selling"
                // [修改] 在售改为 Emerald (翠绿)，与详情页保持一致
                className="text-xs px-3 data-[state=active]:bg-emerald-100 data-[state=active]:text-emerald-800"
              >
                在售
              </TabsTrigger>
              <TabsTrigger
                value="sold"
                // [修改] 已售改为 Slate (灰色)，代表归档/终态
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
            <CreateProjectDialog />
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

      <ProjectDetailSheet
        project={selectedProject}
        isOpen={isSheetOpen}
        onClose={() => setIsSheetOpen(false)}
      />
    </div>
  );
}
