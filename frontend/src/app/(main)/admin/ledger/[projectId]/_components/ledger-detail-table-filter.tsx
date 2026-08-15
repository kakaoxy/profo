"use client";

import useSWR from "swr";
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
import { fetchSubjects, type SubjectItem } from "@/app/(main)/admin/ledger/subject-actions";

export type FilterTab = "all" | "in" | "out";

type SettlementStatus = components["schemas"]["SettlementStatus"];

interface LedgerDetailTableFilterProps {
  filter: FilterTab;
  onFilterChange: (value: FilterTab) => void;
  searchInput: string;
  onSearchInputChange: (value: string) => void;
  subjectFilter: string;
  onSubjectFilterChange: (value: string) => void;
  voucherFilter: string;
  onVoucherFilterChange: (value: string) => void;
  businessForm?: "agent" | "wholesale" | null;
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
  subjectFilter,
  onSubjectFilterChange,
  voucherFilter,
  onVoucherFilterChange,
  businessForm,
  isExporting,
  onExport,
  isSettled,
  settlementStatus,
  onAddRecord,
  onSettlement,
}: LedgerDetailTableFilterProps) {
  // 按项目业务模式过滤科目（wholesale → acquire）
  const mode =
    businessForm === "agent" ? "agent" : businessForm === "wholesale" ? "acquire" : undefined;
  const { data: subjects } = useSWR(
    mode ? `subjects-filter-${mode}` : "subjects-filter-all",
    async () => {
      const res = await fetchSubjects(mode);
      if (res.success) return res.data;
      return [];
    },
  );
  const subjectOptions: SubjectItem[] = subjects ?? [];

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
            value="in"
            className="text-xs h-7 text-money-positive data-[state=active]:text-money-positive"
          >
            仅流入
          </TabsTrigger>
          <TabsTrigger
            value="out"
            className="text-xs h-7 text-money-negative data-[state=active]:text-money-negative"
          >
            仅流出
          </TabsTrigger>
        </TabsList>
      </Tabs>
      <div className="flex w-full sm:w-auto items-center gap-2 flex-wrap">
        <Input
          placeholder="搜索摘要/付款方/收款方…"
          value={searchInput}
          onChange={(e) => onSearchInputChange(e.target.value)}
          className="h-9 w-full sm:w-56 bg-card border-border"
          aria-label="搜索流水"
          name="ledger-search"
          autoComplete="off"
        />
        <Select value={subjectFilter} onValueChange={onSubjectFilterChange}>
          <SelectTrigger className="h-9 w-[160px] bg-card border-border" aria-label="筛选科目分类">
            <SelectValue placeholder="全部科目" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部科目</SelectItem>
            {subjectOptions.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={voucherFilter} onValueChange={onVoucherFilterChange}>
          <SelectTrigger className="h-9 w-[120px] bg-card border-border" aria-label="筛选凭证状态">
            <SelectValue placeholder="凭证状态" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">凭证状态</SelectItem>
            <SelectItem value="with">有凭证</SelectItem>
            <SelectItem value="without">缺凭证</SelectItem>
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
              isSettled ? "bg-apricot-wash text-rust" : "bg-fog text-graphite",
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
