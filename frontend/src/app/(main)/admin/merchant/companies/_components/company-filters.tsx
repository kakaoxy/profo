"use client";

import { Search } from "lucide-react";

import { SteepButton, SteepInput, SteepSelectTrigger } from "@/components/custom/steep-controls";
import { Select, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";

export function CompanyFilters({
  keyword,
  includeDisabled,
  onKeywordChange,
  onIncludeDisabledChange,
  onApply,
  onClear,
  loading,
  hasActiveFilters,
}: {
  keyword: string;
  includeDisabled: string;
  onKeywordChange: (value: string) => void;
  onIncludeDisabledChange: (value: string) => void;
  onApply: () => void;
  onClear: () => void;
  loading: boolean;
  hasActiveFilters: boolean;
}) {
  return (
    <section aria-label="公司筛选" className="rounded-cards bg-pure-white p-5 shadow-steep">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_160px_auto] sm:items-end">
        <div className="min-w-0">
          <FilterLabel>搜索</FilterLabel>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-graphite" />
            <SteepInput
              className="pl-11"
              placeholder="搜索公司名称"
              aria-label="搜索公司名称"
              value={keyword}
              onChange={(event) => onKeywordChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") onApply();
              }}
            />
          </div>
        </div>

        <div>
          <FilterLabel>公司状态</FilterLabel>
          <Select value={includeDisabled} onValueChange={onIncludeDisabledChange}>
            <SteepSelectTrigger aria-label="按公司状态筛选">
              <SelectValue />
            </SteepSelectTrigger>
            <SelectContent className="rounded-[16px] border-dove/40 shadow-steep">
              <SelectItem value="all">全部状态</SelectItem>
              <SelectItem value="normal">仅正常</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 sm:justify-end">
          {hasActiveFilters ? (
            <SteepButton variant="muted" onClick={onClear}>
              清空
            </SteepButton>
          ) : null}
          <SteepButton variant="text" onClick={onApply} disabled={loading}>
            <Search />
            查询
          </SteepButton>
        </div>
      </div>
    </section>
  );
}

function FilterLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="mb-2 block text-[14px] leading-[1.4] tracking-[-0.009em] text-graphite">
      {children}
    </span>
  );
}
