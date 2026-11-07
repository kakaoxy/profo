"use client";

import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { X } from "lucide-react";
import { SearchBar } from "@/components/common";

import { LeadFilterOption } from "../types";

const STORE_STATUS_SUFFIX: Record<string, string> = {
  disabled: "（已停用）",
  merged: "（已合并）",
  relocated: "（已搬迁）",
};

export interface LeadsToolbarProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
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
  filteredCount: number;
  totalCount: number;
  onResetFilters: () => void;
}

/**
 * 列表筛选条：搜索 + 归属筛选，右侧只保留结果计数与清除入口。
 * 状态筛选由上方收房漏斗承担，不在工具栏重复一排 Tab。
 */
export function LeadsToolbar({
  searchQuery,
  onSearchChange,
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
  filteredCount,
  totalCount,
  onResetFilters,
}: LeadsToolbarProps) {
  const creatorLabel = creatorName ? `创建人: ${creatorName}` : `创建人: #${creatorId}`;
  const hasFilters = Boolean(
    searchQuery || creatorId || storeId || brokerId || ownerEmployeeId,
  );

  return (
    <div className="mt-3.5 flex flex-wrap items-center gap-2.5">
      <SearchBar
        value={searchQuery}
        onChange={onSearchChange}
        placeholder="搜索小区、区域或对接人"
        className="sm:w-[318px] [&_input]:h-11 [&_input]:rounded-full [&_input]:border-none [&_input]:bg-pure-white [&_input]:pl-10 [&_input]:pr-9 [&_input]:text-[13px] [&_input]:shadow-steep-sm [&_input]:focus-visible:ring-ink/20 [&_svg]:left-4 [&_svg]:h-4 [&_svg]:w-4"
      />

      {storeOptions.length > 0 && (
        <Select value={storeId || "all"} onValueChange={onStoreChange}>
          <SelectTrigger
            className="h-11 w-40 rounded-full border-none bg-pure-white px-4 text-[12px] text-ash shadow-steep-sm focus:ring-ink/20"
            aria-label="推荐门店筛选"
          >
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
          <SelectTrigger
            className="h-11 w-44 rounded-full border-none bg-pure-white px-4 text-[12px] text-ash shadow-steep-sm focus:ring-ink/20"
            aria-label="推荐经纪人筛选"
          >
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
        <Select value={ownerEmployeeId || "all"} onValueChange={onOwnerEmployeeChange}>
          <SelectTrigger
            className="h-11 w-44 rounded-full border-none bg-pure-white px-4 text-[12px] text-ash shadow-steep-sm focus:ring-ink/20"
            aria-label="对接人筛选"
          >
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

      {creatorId && (
        <Badge
          variant="secondary"
          className="h-9 gap-1.5 rounded-full bg-apricot-wash px-3 text-rust"
        >
          {creatorLabel}
          <button
            type="button"
            onClick={onClearCreatorId}
            className="ml-0.5 inline-flex items-center justify-center rounded-full p-0.5 transition-colors hover:bg-rust/15"
            aria-label="清除创建人筛选"
          >
            <X className="h-3 w-3" />
          </button>
        </Badge>
      )}

      <div className="ml-auto flex items-center gap-3 text-[11px] text-graphite">
        <span className="tabular-nums">
          本页 <b className="font-[480] text-ink">{filteredCount}</b> 条 · 共 {totalCount} 条
        </span>
        {hasFilters && (
          <button
            type="button"
            onClick={onResetFilters}
            className="rounded text-[11px] text-graphite underline decoration-dove underline-offset-[3px] transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20"
          >
            清除筛选
          </button>
        )}
      </div>
    </div>
  );
}
