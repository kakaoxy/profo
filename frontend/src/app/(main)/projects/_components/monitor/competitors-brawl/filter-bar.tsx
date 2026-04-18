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
    <div className="flex flex-wrap items-center gap-4 bg-white p-3 rounded-xl border border-slate-100 shadow-sm">
      <div className="flex items-center gap-2 pr-4 border-r border-slate-100">
        <Filter size={16} className="text-slate-400" />
        <span className="text-xs font-bold text-slate-500 uppercase">
          筛选项目
        </span>
      </div>

      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onToggleStatus("on_sale")}
          className={`${statusFilters.includes("on_sale") ? "bg-indigo-600 text-white hover:bg-indigo-700" : "bg-slate-50 text-slate-500 hover:bg-slate-100"} border-none rounded-lg font-bold text-[11px] h-8 transition-colors`}
        >
          在售 ({counts.on_sale})
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onToggleStatus("sold")}
          className={`${statusFilters.includes("sold") ? "bg-indigo-600 text-white hover:bg-indigo-700" : "bg-slate-50 text-slate-500 hover:bg-slate-100"} border-none rounded-lg font-bold text-[11px] h-8 transition-colors`}
        >
          已售 ({counts.sold})
        </Button>
      </div>

      <div className="h-4 w-px bg-slate-200 mx-2" />

      {/* 户型筛选 */}
      <div className="flex gap-1.5">
        {LAYOUT_OPTIONS.map((r) => (
          <button
            key={r}
            onClick={() => onToggleLayout(r)}
            className={`px-3 py-1 text-[11px] font-bold rounded-full transition-all ${
              layoutFilters.includes(r)
                ? "bg-slate-800 text-white"
                : "bg-slate-50 text-slate-400 hover:bg-slate-100"
            }`}
          >
            {r}
          </button>
        ))}
      </div>

      <div className="flex-1 min-w-[200px] relative">
        <Search
          className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          size={14}
        />
        <input
          type="text"
          placeholder="搜索小区名称..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full pl-9 pr-4 py-2 bg-slate-50 border-none rounded-lg text-xs font-medium focus:ring-2 ring-indigo-500/10 outline-none transition-all"
        />
      </div>
    </div>
  );
}
