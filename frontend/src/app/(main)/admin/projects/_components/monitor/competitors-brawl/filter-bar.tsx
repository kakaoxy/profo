"use client";

import { Search, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";

interface FilterBarProps {
  statusFilters: ("on_sale" | "sold")[];
  layoutFilters: string[];
  searchQuery: string;
  counts: { on_sale: number; sold: number };
  onToggleStatus: (status: "on_sale" | "sold") => void;
  onToggleLayout: (layout: string) => void;
  onSearchChange: (value: string) => void;
}

const LAYOUT_OPTIONS = ["1室", "2室", "3室", "4室+"];

export function FilterBar({
  statusFilters,
  layoutFilters,
  searchQuery,
  counts,
  onToggleStatus,
  onToggleLayout,
  onSearchChange,
}: FilterBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-cards bg-white p-3 shadow-steep-sm">
      <div className="flex items-center gap-2 pr-4 border-r border-fog">
        <Filter size={16} className="text-graphite" />
        <span className="text-xs font-bold text-graphite uppercase">筛选项目</span>
      </div>

      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onToggleStatus("on_sale")}
          className={`${statusFilters.includes("on_sale") ? "bg-primary text-primary-foreground hover:bg-primary/90" : "bg-fog text-graphite hover:bg-fog/80"} border-none rounded-lg font-bold text-[11px] h-8 transition-colors`}
        >
          在售 ({counts.on_sale})
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onToggleStatus("sold")}
          className={`${statusFilters.includes("sold") ? "bg-primary text-primary-foreground hover:bg-primary/90" : "bg-fog text-graphite hover:bg-fog/80"} border-none rounded-lg font-bold text-[11px] h-8 transition-colors`}
        >
          已售 ({counts.sold})
        </Button>
      </div>

      <div className="h-4 w-px bg-border mx-2" />

      {/* 户型筛选 */}
      <div className="flex gap-1.5">
        {LAYOUT_OPTIONS.map((r) => (
          <button
            key={r}
            onClick={() => onToggleLayout(r)}
            className={`px-3 py-1 text-[11px] font-bold rounded-full transition-all ${
              layoutFilters.includes(r)
                ? "bg-foreground text-background"
                : "bg-fog text-graphite hover:bg-fog/80"
            }`}
          >
            {r}
          </button>
        ))}
      </div>

      <div className="flex-1 min-w-[200px] relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-graphite" size={14} />
        <input
          type="text"
          placeholder="搜索小区名称..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full pl-9 pr-4 py-2 bg-fog border-none rounded-lg text-xs font-medium focus:ring-2 ring-primary/10 outline-none transition-all"
        />
      </div>
    </div>
  );
}
