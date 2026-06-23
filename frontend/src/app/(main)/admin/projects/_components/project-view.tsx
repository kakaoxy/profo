"use client";

import { useState, useMemo } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { DataTable } from "@/components/ui/data-table";
import { SearchBar, ListView } from "@/components/common";
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
          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
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
