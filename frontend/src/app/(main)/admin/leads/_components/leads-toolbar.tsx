"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Download, List, LayoutGrid, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { SearchBar } from "@/components/common";
import { HasPermission } from "@/components/has-permission";
import { PERMISSION_CODES } from "@/lib/auth/permissions";

import { LeadTabValue, LeadStatus } from "../types";
import { LEAD_STATUS_META } from "../_lib/lead-status-meta";

const VALID_TAB_VALUES: LeadTabValue[] = ["all", ...Object.values(LeadStatus)];
/** 顶部状态 Tab：lost_to_competitor 归属到「已放弃」（rejected）Tab，不单列 */
const TAB_STATUSES = Object.values(LeadStatus).filter(
  (status) => status !== LeadStatus.LOST_TO_COMPETITOR,
);

/** 状态 Tab 统一 Steep 激活态（与 projects 页一致：ink 实底 + 白字） */
const TAB_TRIGGER_CLASS =
  "text-xs px-3 text-graphite hover:text-ink data-[state=active]:bg-ink data-[state=active]:text-white";

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
  creatorId?: string;
  creatorName?: string;
  onClearCreatorId: () => void;
}

export function LeadsToolbar({
  searchQuery,
  onSearchChange,
  activeTab,
  onTabChange,
  viewMode,
  onViewModeChange,
  onAddLead,
  creatorId,
  creatorName,
  onClearCreatorId,
}: LeadsToolbarProps) {
  const creatorLabel = creatorName ? `创建人: ${creatorName}` : `创建人: #${creatorId}`;

  return (
    <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
      {/* Left: Filter Area */}
      <div className="flex flex-col sm:flex-row w-full lg:w-auto gap-3 items-start sm:items-center">
        <SearchBar value={searchQuery} onChange={onSearchChange} placeholder="搜索小区名称..." />

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
          <TabsList className="h-auto bg-fog p-1 rounded-cards border-none flex-wrap min-h-10">
            <TabsTrigger value="all" className={TAB_TRIGGER_CLASS}>
              全部
            </TabsTrigger>
            {TAB_STATUSES.map((status) => (
              <TabsTrigger key={status} value={status} className={TAB_TRIGGER_CLASS}>
                {LEAD_STATUS_META[status].label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {/* 创建人筛选标签（URL 含 creator_id 时展示） */}
        {creatorId && (
          <Badge
            variant="secondary"
            className="h-9 px-3 gap-1.5 rounded-full bg-apricot-wash text-rust"
          >
            {creatorLabel}
            <button
              type="button"
              onClick={onClearCreatorId}
              className="ml-0.5 inline-flex items-center justify-center rounded-full hover:bg-rust/15 p-0.5 transition-colors"
              aria-label="清除创建人筛选"
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        )}
      </div>

      {/* Right: Actions */}
      <div className="flex w-full lg:w-auto gap-3 items-center">
        {/* View Mode Toggle */}
        <div className="flex items-center gap-1 bg-fog p-1 rounded-cards">
          <button
            className={cn(
              "flex items-center justify-center px-3 py-1.5 rounded-inputs text-xs font-medium transition-all cursor-pointer",
              viewMode === "table"
                ? "bg-pure-white shadow-steep-sm text-ink"
                : "text-graphite hover:text-ink",
            )}
            onClick={() => onViewModeChange("table")}
          >
            <List className="h-3.5 w-3.5 mr-1.5" />
            列表
          </button>
          <button
            className={cn(
              "flex items-center justify-center px-3 py-1.5 rounded-inputs text-xs font-medium transition-all cursor-pointer",
              viewMode === "grid"
                ? "bg-pure-white shadow-steep-sm text-ink"
                : "text-graphite hover:text-ink",
            )}
            onClick={() => onViewModeChange("grid")}
          >
            <LayoutGrid className="h-3.5 w-3.5 mr-1.5" />
            网格
          </button>
        </div>

        <Button
          variant="outline"
          className="flex-1 lg:flex-none rounded-full border border-dove bg-pure-white text-ink hover:bg-fog"
          onClick={() => toast.success("正在生成报表...")}
        >
          <Download className="mr-2 h-4 w-4" />
          导出
        </Button>

        <HasPermission code={PERMISSION_CODES.LEAD_WRITE}>
          <Button
            className="flex-1 lg:flex-none rounded-full bg-ink text-white hover:bg-ink/90 h-10 px-4"
            onClick={onAddLead}
          >
            <Plus className="mr-2 h-4 w-4" />
            录入新线索
          </Button>
        </HasPermission>
      </div>
    </div>
  );
}
