"use client";

import { Search, Loader2 } from "lucide-react";

interface SearchSectionProps {
  searchQuery: string;
  searchResults: { id: number; name: string }[];
  isSearching: boolean;
  isAdding: boolean;
  onSearchChange: (value: string) => void;
  onAdd: (id: number) => void;
}

export function SearchSection({
  searchQuery,
  searchResults,
  isSearching,
  isAdding,
  onSearchChange,
  onAdd,
}: SearchSectionProps) {
  return (
    <div>
      <label className="block text-xs font-bold text-slate-500 mb-1.5">
        添加竞品小区
      </label>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="搜索小区名称 (至少2个字符)..."
          className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 ring-indigo-500/20 outline-none transition-all"
        />
        {isSearching && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-slate-400" />
        )}
      </div>

      {searchResults.length > 0 && (
        <div className="mt-2 border border-slate-200 rounded-lg max-h-40 overflow-y-auto divide-y divide-slate-100">
          {searchResults.map((item) => (
            <button
              key={item.id}
              onClick={() => onAdd(item.id)}
              disabled={isAdding}
              className="w-full px-3 py-2.5 text-left text-sm hover:bg-indigo-50 transition-colors flex justify-between items-center disabled:opacity-50"
            >
              <span className="text-slate-700">{item.name}</span>
              <span className="text-xs text-indigo-600 font-medium">
                + 添加
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
