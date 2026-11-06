"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Download, List, LayoutGrid, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { SearchBar } from "@/components/common";
import { HasPermission } from "@/components/has-permission";
import { PERMISSION_CODES } from "@/lib/auth/permissions";

import { LeadTabValue, LeadStatus, LeadFilterOption } from "../types";
import { LEAD_STATUS_META } from "../_lib/lead-status-meta";
import type { LeadStats } from "./leads-stats";

const VALID_TAB_VALUES: LeadTabValue[] = ["all", ...Object.values(LeadStatus)];
/** 顶部状态 Tab：lost_to_competitor 归属到「已放弃」（rejected）Tab，不单列 */
const TAB_STATUSES = Object.values(LeadStatus).filter(
  (status) => status !== LeadStatus.LOST_TO_COMPETITOR,
);

/** 门店筛选下拉的历史状态后缀（已停用/合并/搬迁仍可筛选历史线索） */
const STORE_STATUS_SUFFIX: Record<string, string> = {
  disabled: "（已停用）",
  merged: "（已合并）",
  relocated: "（已搬迁）",
};

/** Steep Tab 胶囊：白底容器 + Ink 激活（与 projects 页一致），.cnt 计数徽标随激活态换色 */
const TAB_TRIGGER_CLASS =
  "rounded-full text-[13px] px-3.5 text-ash hover:text-ink data-[state=active]:bg-ink data-[state=active]:text-white data-[state=active]:[&_.cnt]:text-white/65";

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
  /** 归属筛选：门店、经纪人、对接人 */
  storeId?: string;
  onStoreChange: (value: string) => void;
  brokerId?: string;
  onBrokerChange: (value: string) => void;
  ownerEmployeeId?: string;
  onOwnerEmployeeChange: (value: string) => void;
  storeOptions?: LeadFilterOption[];
  brokerOptions?: LeadFilterOption[];
  employeeOptions?: LeadFilterOption[];
  /** 各状态计数（LeadsStats 同源数据），用于 Tab 计数徽标 */
  stats?: LeadStats;
  /** 全部线索数（列表 total），用于「全部」Tab 计数 */
  total?: number;
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
  storeId,
  onStoreChange,
  brokerId,
  onBrokerChange,
  ownerEmployeeId,
  onOwnerEmployeeChange,
  storeOptions = [],
  brokerOptions = [],
  employeeOptions = [],
  stats,
  total,
}: LeadsToolbarProps) {
  const creatorLabel = creatorName ? `创建人: ${creatorName}` : `创建人: #${creatorId}`;

  // Tab 计数：已放弃 = rejected + lost_to_competitor（与 LeadsStats 口径一致）
  const rejectedCount = (stats?.rejected || 0) + (stats?.lost_to_competitor || 0);
  const tabCounts: Record<string, number | undefined> = {
    all: total,
    [LeadStatus.PENDING_ASSESSMENT]: stats?.pending_assessment,
    [LeadStatus.PENDING_VISIT]: stats?.pending_visit,
    [LeadStatus.VISITED]: stats?.visited,
    [LeadStatus.SIGNED]: stats?.signed,
    [LeadStatus.REJECTED]: rejectedCount,
  };

  const renderTabCount = (value?: number) =>
    value === undefined ? null : (
      <span className="cnt ml-1 text-[12px] text-dove tabular-nums">{value}</span>
    );

  const hasAttributionFilters =
    storeOptions.length > 0 || brokerOptions.length > 0 || employeeOptions.length > 0;

  return (
    <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
      {/* Left: Filter Area */}
      <div className="flex w-full flex-col gap-3 lg:w-auto">
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
            <TabsList className="h-auto min-h-10 flex-wrap rounded-full border-none bg-pure-white p-1 shadow-steep-sm">
              <TabsTrigger value="all" className={TAB_TRIGGER_CLASS}>
                全部
                {renderTabCount(tabCounts.all)}
              </TabsTrigger>
              {TAB_STATUSES.map((status) => (
                <TabsTrigger key={status} value={status} className={TAB_TRIGGER_CLASS}>
                  {LEAD_STATUS_META[status].label}
                  {renderTabCount(tabCounts[status])}
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

        {/* 归属筛选：门店、经纪人、对接人 */}
        {hasAttributionFilters && (
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="归属筛选">
            {storeOptions.length > 0 && (
              <Select value={storeId || "all"} onValueChange={onStoreChange}>
                <SelectTrigger className="h-9 w-40" aria-label="推荐门店筛选">
                  <SelectValue placeholder="全部门店" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部门店</SelectItem>
                  {storeOptions.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.name}
                      {STORE_STATUS_SUFFIX[option.status || ""] || ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {brokerOptions.length > 0 && (
              <Select value={brokerId || "all"} onValueChange={onBrokerChange}>
                <SelectTrigger className="h-9 w-44" aria-label="推荐经纪人筛选">
                  <SelectValue placeholder="全部经纪人" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部经纪人</SelectItem>
                  {brokerOptions.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.name}
                      {option.description ? ` · ${option.description}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {employeeOptions.length > 0 && (
              <Select
                value={ownerEmployeeId || "all"}
                onValueChange={onOwnerEmployeeChange}
              >
                <SelectTrigger className="h-9 w-44" aria-label="对接人筛选">
                  <SelectValue placeholder="全部对接人" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部对接人</SelectItem>
                  {employeeOptions.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.name}
                      {option.description ? ` · ${option.description}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        )}
      </div>

      {/* Right: Actions */}
      <div className="flex w-full lg:w-auto gap-3 items-center">
        {/* View Mode Toggle */}
        {/* 视图切换：纯图标双按钮（设计稿 02 节形态，30px 方形，激活 bg-fog） */}
        <div className="flex items-center gap-0.5 rounded-xl bg-pure-white p-[3px] shadow-steep-sm">
          <button
            type="button"
            aria-label="表格视图"
            aria-pressed={viewMode === "table"}
            title="表格视图"
            className={cn(
              "flex h-[30px] w-[30px] items-center justify-center rounded-[9px] transition-colors cursor-pointer",
              viewMode === "table" ? "bg-fog text-ink" : "text-graphite hover:text-ink",
            )}
            onClick={() => onViewModeChange("table")}
          >
            <List className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="卡片视图"
            aria-pressed={viewMode === "grid"}
            title="卡片视图"
            className={cn(
              "flex h-[30px] w-[30px] items-center justify-center rounded-[9px] transition-colors cursor-pointer",
              viewMode === "grid" ? "bg-fog text-ink" : "text-graphite hover:text-ink",
            )}
            onClick={() => onViewModeChange("grid")}
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
        </div>

        {/* 次级动作 = text link（设计稿决策 04） */}
        <button
          type="button"
          onClick={() => toast.success("正在生成报表...")}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded px-2 py-2 text-sm font-[450] text-ink transition-colors hover:text-rust focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:flex-none"
        >
          <Download className="h-4 w-4" />
          导出
        </button>

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
