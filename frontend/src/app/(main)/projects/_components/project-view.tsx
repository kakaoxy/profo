"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Download, Search, X, Filter } from "lucide-react";
import { toast } from "sonner";
import { DataTable } from "@/components/ui/data-table";
import { CreateProjectDialog } from "./create-project-dialog";
import { ProjectDetailSheet } from "./project-detail-sheet";
import { columns } from "./columns";
import { Project } from "../types";

interface ProjectViewProps {
  data: Project[];
  total: number;
}

export function ProjectView({ data, total }: ProjectViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const currentStatus = searchParams.get("status") || "all";
  const currentSearch = searchParams.get("community_name") || "";

  const [searchValue, setSearchValue] = useState(currentSearch);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);

  const updateParams = (key: string, value: string | null) => {
    const params = new URLSearchParams(searchParams);
    if (value && value !== "all") {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    params.set("page", "1");
    router.replace(`?${params.toString()}`);
  };

  const handleSearch = () => {
    updateParams("community_name", searchValue.trim() || null);
  };

  const clearSearch = () => {
    setSearchValue("");
    updateParams("community_name", null);
  };

  const handleRowClick = (row: Project) => {
    setSelectedProject(row);
    setIsSheetOpen(true);
  };

  return (
    <div className="space-y-4">
      {/* --- 顶部工具栏 --- */}
      {/* 🔥 [修复] 移除白色背景块，改用透明或更融合的设计，如果需要白底，保持圆角和边框一致 */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        
        {/* 左侧：筛选区域 */}
        <div className="flex flex-col sm:flex-row w-full lg:w-auto gap-3">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="搜索小区名称..."
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="pl-9 pr-9 bg-white border-slate-200 focus-visible:ring-blue-600"
            />
            {searchValue && (
              <button 
                onClick={clearSearch}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          <Select 
            value={currentStatus} 
            onValueChange={(val) => updateParams("status", val)}
          >
            <SelectTrigger className="w-full sm:w-[160px] bg-white border-slate-200">
              <div className="flex items-center gap-2 text-slate-600">
                <Filter className="h-3.5 w-3.5" />
                <span className="text-slate-900">
                  <SelectValue placeholder="全部状态" />
                </span>
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部状态</SelectItem>
              <SelectItem value="signing">签约</SelectItem>
              <SelectItem value="renovating">装修</SelectItem>
              <SelectItem value="selling">在售</SelectItem>
              <SelectItem value="sold">已售</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* 右侧：操作按钮 */}
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

      {/* --- 表格区域 --- */}
      <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <DataTable 
            columns={columns} 
            data={data} 
            onRowClick={handleRowClick}
          />
        </div>
        
        {data.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center px-4">
            <div className="bg-slate-50 p-4 rounded-full mb-4">
              <Search className="h-8 w-8 text-slate-300" />
            </div>
            <h3 className="text-base font-semibold text-slate-900">暂无项目数据</h3>
            <p className="text-sm text-slate-500 max-w-sm mt-1">
              没有找到匹配的项目。请尝试调整筛选条件。
            </p>
            <Button 
                variant="link" 
                className="mt-2 text-blue-600 font-medium"
                onClick={clearSearch}
            >
                清空筛选条件
            </Button>
          </div>
        )}
      </div>

      {/* 底部信息 */}
      <div className="flex items-center justify-between text-xs text-slate-500 px-1">
        <span>共 {total} 条记录</span>
      </div>

      <ProjectDetailSheet 
        project={selectedProject} 
        isOpen={isSheetOpen} 
        onClose={() => setIsSheetOpen(false)} 
      />
    </div>
  );
}