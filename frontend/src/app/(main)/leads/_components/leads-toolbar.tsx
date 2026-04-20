"use client";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, X, Download, List, LayoutGrid, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

import { LeadTabValue, LeadStatus } from "../types";

const VALID_TAB_VALUES: LeadTabValue[] = ["all", ...Object.values(LeadStatus)];

function isValidTabValue(value: string): value is LeadTabValue {
  return VALID_TAB_VALUES.includes(value as LeadTabValue);
}

interface LeadsToolbarProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  activeTab: LeadTabValue;
  onTabChange: (value: LeadTabValue) => void;
  viewMode: "table" | "grid";
  onViewModeChange: (mode: "table" | "grid") => void;
  onAddLead: () => void;
}

export function LeadsToolbar({
  searchQuery,
  onSearchChange,
  activeTab,
  onTabChange,
  viewMode,
  onViewModeChange,
  onAddLead,
}: LeadsToolbarProps) {
  return (
    <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
      {/* Left: Filter Area */}
      <div className="flex flex-col sm:flex-row w-full lg:w-auto gap-3 items-center">
        {/* Search Input */}
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="搜索小区名称..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9 pr-9 bg-white border-slate-200 focus-visible:ring-blue-600"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        {/* Status Tabs */}
        <Tabs
          value={activeTab}
          onValueChange={(value) => {
            if (isValidTabValue(value)) {
              onTabChange(value);
            }
          }}
          className="w-full sm:w-auto"
        >
          <TabsList className="h-10 bg-slate-100/50 p-1 rounded-lg flex-wrap">
            <TabsTrigger value="all" className="text-xs px-3">
              全部
            </TabsTrigger>
            <TabsTrigger
              value="pending_assessment"
              className="text-xs px-3 data-[state=active]:bg-blue-100 data-[state=active]:text-blue-800"
            >
              待评估
            </TabsTrigger>
            <TabsTrigger
              value="pending_visit"
              className="text-xs px-3 data-[state=active]:bg-orange-100 data-[state=active]:text-orange-800"
            >
              待看房
            </TabsTrigger>
            <TabsTrigger
              value="visited"
              className="text-xs px-3 data-[state=active]:bg-emerald-100 data-[state=active]:text-emerald-800"
            >
              已看房
            </TabsTrigger>
            <TabsTrigger
              value="signed"
              className="text-xs px-3 data-[state=active]:bg-indigo-100 data-[state=active]:text-indigo-800"
            >
              已签约
            </TabsTrigger>
            <TabsTrigger
              value="rejected"
              className="text-xs px-3 data-[state=active]:bg-slate-200 data-[state=active]:text-slate-800"
            >
              已驳回
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Right: Actions */}
      <div className="flex w-full lg:w-auto gap-3 items-center">
        {/* View Mode Toggle */}
        <div className="flex items-center gap-1 bg-slate-100/50 p-1 rounded-lg">
          <button
            className={cn(
              "flex items-center justify-center px-3 py-1.5 rounded-md text-xs font-medium transition-all",
              viewMode === "table"
                ? "bg-white shadow-sm text-slate-900"
                : "text-slate-500 hover:text-slate-700"
            )}
            onClick={() => onViewModeChange("table")}
          >
            <List className="h-3.5 w-3.5 mr-1.5" />
            列表
          </button>
          <button
            className={cn(
              "flex items-center justify-center px-3 py-1.5 rounded-md text-xs font-medium transition-all",
              viewMode === "grid"
                ? "bg-white shadow-sm text-slate-900"
                : "text-slate-500 hover:text-slate-700"
            )}
            onClick={() => onViewModeChange("grid")}
          >
            <LayoutGrid className="h-3.5 w-3.5 mr-1.5" />
            网格
          </button>
        </div>

        <Button
          variant="outline"
          className="flex-1 lg:flex-none bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
          onClick={() => toast.success("正在生成报表...")}
        >
          <Download className="mr-2 h-4 w-4" />
          导出
        </Button>

        <Button
          className="flex-1 lg:flex-none bg-blue-600 hover:bg-blue-700 text-white shadow-sm"
          onClick={onAddLead}
        >
          <Plus className="mr-2 h-4 w-4" />
          新增线索
        </Button>
      </div>
    </div>
  );
}
