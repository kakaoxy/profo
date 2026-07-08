"use client";

import { Loader2, Download, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { components } from "@/lib/api-types";

export type FilterTab = "all" | "income" | "expense";

type SettlementStatus = components["schemas"]["SettlementStatus"];

interface LedgerDetailTableFilterProps {
  filter: FilterTab;
  onFilterChange: (value: FilterTab) => void;
  searchInput: string;
  onSearchInputChange: (value: string) => void;
  categoryFilter: string;
  onCategoryFilterChange: (value: string) => void;
  categoryOptions: string[];
  isExporting: boolean;
  onExport: () => void;
  isSettled: boolean;
  settlementStatus?: SettlementStatus | null;
  onAddRecord: () => void;
  onSettlement: () => void;
}

export function LedgerDetailTableFilter({
  filter,
  onFilterChange,
  searchInput,
  onSearchInputChange,
  categoryFilter,
  onCategoryFilterChange,
  categoryOptions,
  isExporting,
  onExport,
  isSettled,
  settlementStatus,
  onAddRecord,
  onSettlement,
}: LedgerDetailTableFilterProps) {
  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
      <Tabs
        value={filter}
        onValueChange={(v) => onFilterChange(v as FilterTab)}
        className="w-full sm:w-auto"
      >
        <TabsList className="bg-muted p-1 h-9">
          <TabsTrigger value="all" className="text-xs h-7">
            全部
          </TabsTrigger>
          <TabsTrigger
            value="income"
            className="text-xs h-7 text-error data-[state=active]:text-error"
          >
            收入
          </TabsTrigger>
          <TabsTrigger
            value="expense"
            className="text-xs h-7 text-success data-[state=active]:text-success"
          >
            支出
          </TabsTrigger>
        </TabsList>
      </Tabs>
      <div className="flex w-full sm:w-auto items-center gap-2 flex-wrap">
        <Input
          placeholder="搜索交易方…"
          value={searchInput}
          onChange={(e) => onSearchInputChange(e.target.value)}
          className="h-9 w-full sm:w-56 bg-card border-border"
          aria-label="搜索交易方"
          name="counterparty-search"
          autoComplete="off"
        />
        <Select
          value={categoryFilter}
          onValueChange={onCategoryFilterChange}
        >
          <SelectTrigger
            className="h-9 w-[140px] bg-card border-border"
            aria-label="筛选分类"
          >
            <SelectValue placeholder="全部分类" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部分类</SelectItem>
            {categoryOptions.map((cat) => (
              <SelectItem key={cat} value={cat}>
                {cat}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="ghost"
          size="sm"
          className="h-9 gap-1.5 rounded-full text-ink hover:text-rust hover:bg-transparent"
          onClick={onExport}
          disabled={isExporting}
        >
          {isExporting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          导出
        </Button>
        <Button
          size="sm"
          className="h-9 gap-1.5 rounded-full bg-ink text-pure-white hover:bg-ink/90"
          onClick={onAddRecord}
          disabled={isSettled}
          title={isSettled ? "已结算，不可记账" : undefined}
        >
          <Plus className="h-4 w-4" />
          记一笔
        </Button>
        {settlementStatus && (
          <Badge
            variant="secondary"
            className={cn(
              "gap-1.5 border-transparent px-3 py-1",
              isSettled
                ? "bg-apricot-wash text-rust"
                : "bg-fog text-graphite",
            )}
          >
            <span
              className={cn(
                "h-2 w-2 rounded-full",
                isSettled ? "bg-rust" : "bg-graphite animate-pulse",
              )}
            />
            {isSettled ? "已结算" : "未结算"}
          </Badge>
        )}
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "h-9 gap-1.5 rounded-full",
            isSettled
              ? "text-rust hover:text-rust hover:bg-apricot-wash/50"
              : "bg-ink text-pure-white hover:bg-ink/90",
          )}
          onClick={onSettlement}
        >
          {isSettled ? "反结算" : "结算"}
        </Button>
      </div>
    </div>
  );
}
