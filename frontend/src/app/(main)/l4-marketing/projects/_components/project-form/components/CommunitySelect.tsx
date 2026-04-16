"use client";

import * as React from "react";
import { Check, ChevronsUpDown, Building2, Plus, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { searchCommunitiesAction } from "@/app/(main)/leads/actions";
import type { CommunitySelectProps, Community } from "./types";

/**
 * 小区选择组件
 * 
 * 提供小区搜索、选择和新建功能
 * 支持模糊搜索已有小区或输入新小区名称
 * 
 * @example
 * ```tsx
 * <CommunitySelect 
 *   value="通河二村" 
 *   onChange={(name, id) => console.log(name, id)} 
 * />
 * ```
 */
export function CommunitySelect({ value, onChange }: CommunitySelectProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<Community[]>([]);
  const [loading, setLoading] = React.useState(false);
  const debounceRef = React.useRef<NodeJS.Timeout>(null);

  // 搜索小区
  React.useEffect(() => {
    if (!open) return;

    if (!query) {
      setResults([]);
      return;
    }

    setLoading(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      try {
        const data = await searchCommunitiesAction(query);
        setResults(data);
      } catch (err) {
        console.error("搜索小区失败:", err);
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, open]);

  // 选择已有小区
  const handleSelect = (community: Community) => {
    onChange(community.name, community.id);
    setOpen(false);
    setQuery("");
  };

  // 使用新名称创建
  const handleCreateNew = () => {
    if (!query) return;
    onChange(query);
    setOpen(false);
    setQuery("");
  };

  return (
    <div className="space-y-2">
      <label className="block text-xs font-bold text-[#707785] uppercase tracking-wider">
        小区名称 <span className="text-[#ba1a1a]">*</span>
      </label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full h-12 justify-between rounded-xl px-4 text-left font-medium border-[#c0c7d6]/50 hover:bg-[#e5eeff] hover:text-[#0b1c30] bg-white"
          >
            <div className="flex items-center gap-2 truncate">
              <Building2 className="h-4 w-4 text-[#707785] shrink-0" />
              <span className={cn("truncate", !value && "text-[#707785] font-normal")}>
                {value || "输入小区搜索..."}
              </span>
            </div>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[400px] p-0 rounded-xl" align="start">
          {/* 搜索输入框 */}
          <div className="p-2 border-b border-[#c0c7d6]/20">
            <input
              className="w-full px-3 py-2 text-sm bg-[#f8f9ff] border border-[#c0c7d6]/30 rounded-lg outline-none focus:ring-2 focus:ring-[#005daa]/20"
              placeholder="输入关键词搜索..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          {/* 搜索结果列表 */}
          <div className="max-h-[300px] overflow-y-auto p-1">
            {loading ? (
              <div className="flex items-center justify-center py-6 text-[#707785]">
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
                <span className="text-xs">搜索中...</span>
              </div>
            ) : null}

            {/* 新建选项 */}
            {!loading && results.length === 0 && query ? (
              <div className="p-1">
                <button
                  className="w-full flex items-center gap-2 p-3 text-sm text-[#005daa] bg-[#005daa]/5 hover:bg-[#005daa]/10 rounded-lg transition-colors font-bold"
                  onClick={handleCreateNew}
                >
                  <Plus className="h-4 w-4" />
                  <span>使用新名称 &quot;{query}&quot;</span>
                </button>
              </div>
            ) : null}

            {/* 搜索结果 */}
            {!loading && results.map((community) => (
              <button
                key={community.id}
                className={cn(
                  "w-full flex items-center justify-between p-3 text-sm rounded-lg hover:bg-[#eff4ff] transition-colors group text-left",
                  value === community.name && "bg-[#eff4ff] text-[#005daa] font-bold"
                )}
                onClick={() => handleSelect(community)}
              >
                <div className="flex flex-col gap-0.5">
                  <span className="font-bold text-[#0b1c30]">{community.name}</span>
                  <span className="text-[10px] text-[#707785] flex items-center gap-1">
                    {community.district} {community.business_circle && `· ${community.business_circle}`}
                  </span>
                </div>
                {value === community.name && <Check className="h-4 w-4" />}
              </button>
            ))}

            {/* 空状态提示 */}
            {!loading && !query && results.length === 0 ? (
              <div className="py-8 text-center text-[#707785] text-xs">
                请输入关键词查找小区
              </div>
            ) : null}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
