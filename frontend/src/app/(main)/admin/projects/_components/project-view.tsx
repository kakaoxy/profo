"use client";

import { useState, useMemo } from "react";
import { useQueryStates, parseAsString, parseAsInteger } from "nuqs";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { DataTable } from "@/components/ui/data-table";
import { SearchBar, ListView } from "@/components/common";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CreateProjectDialog } from "./create-project/index";
import { ProjectDetailSheet } from "./project-detail-sheet";
import { columns } from "./columns";
import { Project } from "../types";

interface ProjectViewProps {
  data: Project[];
  total: number;
}

export function ProjectView({ data, total }: ProjectViewProps) {
  // 1. status / business_form 通过 URL 同步由服务端筛选；searchQuery 仅作用于当前页数据
  const [{ status: activeTab, business_form: businessForm }, setQuery] =
    useQueryStates(
      {
        status: parseAsString.withDefault("all"),
        page: parseAsInteger.withDefault(1),
        business_form: parseAsString.withDefault("all"),
      },
      { shallow: false }
    );
  const [searchQuery, setSearchQuery] = useState("");

  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);

  // 2. 关键字搜索仅作用于当前页数据（status 已由服务端按 URL ?status= 筛选分页）
  const filteredData = useMemo(() => {
    return data.filter((project) => {
      const searchLower = searchQuery.toLowerCase().trim();
      const searchMatch =
        !searchLower ||
        project.community_name?.toLowerCase().includes(searchLower) ||
        project.name.toLowerCase().includes(searchLower);

      return searchMatch;
    });
  }, [data, searchQuery]);

  const handleRowClick = (row: Project) => {
    setSelectedProject(row);
    setIsSheetOpen(true);
  };

  return (
    <>
      <ListView
        searchBar={
          <SearchBar
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="搜索小区名称..."
          />
        }
        filterTabs={
          <div className="flex flex-col sm:flex-row w-full lg:w-auto gap-3 items-center">
            <Tabs
              value={activeTab}
              onValueChange={(val) => setQuery({ status: val, page: 1 })}
              className="w-full sm:w-auto"
            >
              <TabsList className="h-10 bg-muted p-1 rounded-lg">
                <TabsTrigger value="all" className="text-xs px-3">
                  全部
                </TabsTrigger>
                <TabsTrigger
                  value="signing"
                  className="text-xs px-3 data-[state=active]:bg-primary/10 data-[state=active]:text-primary"
                >
                  签约
                </TabsTrigger>
                <TabsTrigger
                  value="renovating"
                  className="text-xs px-3 data-[state=active]:bg-amber-100 data-[state=active]:text-amber-800"
                >
                  装修
                </TabsTrigger>
                <TabsTrigger
                  value="selling"
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

            {/* 业务形式筛选 */}
            <Select
              value={businessForm}
              onValueChange={(val) =>
                setQuery({ business_form: val, page: 1 })
              }
            >
              <SelectTrigger className="h-10 w-[140px] bg-muted border-0 rounded-lg">
                <SelectValue placeholder="业务形式" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部业务形式</SelectItem>
                <SelectItem value="agent">代理美化</SelectItem>
                <SelectItem value="wholesale">收购美化</SelectItem>
              </SelectContent>
            </Select>
          </div>
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
              <CreateProjectDialog />
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

      <ProjectDetailSheet
        key={selectedProject?.id}
        project={selectedProject}
        isOpen={isSheetOpen}
        onClose={() => setIsSheetOpen(false)}
      />
    </>
  );
}
