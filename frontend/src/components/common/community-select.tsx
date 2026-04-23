"use client";

import React, { useState, useEffect, useRef } from "react";
import { Check, ChevronsUpDown, Building2, Plus, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { searchCommunitiesAction, createCommunityAction } from "@/app/(main)/leads/actions";
import { toast } from "sonner";

/**
 * 社区数据结构
 * 包含所有可能的字段以兼容不同使用场景
 */
export interface Community {
  id: string;
  name: string;
  district?: string;
  businessCircle?: string;
}

/**
 * 社区选择组件Props
 */
export interface CommunitySelectProps {
  /** 当前选中的社区名称 */
  value: string;
  /**
   * 选择回调
   * @param community - 选中的社区完整数据
   * @param isNew - 是否为新创建的社区
   */
  onChange: (community: Community, isNew?: boolean) => void;
  /** 占位提示文本 */
  placeholder?: string;
  /** 标签文本 */
  label?: string;
  /** 是否禁用 */
  disabled?: boolean;
  /** 自定义类名 */
  className?: string;
  /** 样式变体 */
  variant?: "default" | "marketing";
  /** 是否显示创建新社区选项 */
  allowCreate?: boolean;
}

/**
 * 通用社区选择组件
 *
 * 提供社区搜索、选择和新建功能
 * 支持模糊搜索已有社区或输入新社区名称
 *
 * @example
 * ```tsx
 * // 基础用法
 * <CommunitySelect
 *   value={communityName}
 *   onChange={(community) => setCommunityName(community.name)}
 * />
 *
 * // 需要区域信息
 * <CommunitySelect
 *   value={communityName}
 *   onChange={(community) => {
 *     setCommunityName(community.name);
 *     setDistrict(community.district);
 *   }}
 * />
 *
 * // 营销版样式
 * <CommunitySelect
 *   value={communityName}
 *   variant="marketing"
 *   onChange={(community) => setCommunityName(community.name)}
 * />
 * ```
 */
export function CommunitySelect({
  value,
  onChange,
  placeholder = "输入小区搜索...",
  label = "小区名称",
  disabled = false,
  className,
  variant = "default",
  allowCreate = true,
}: CommunitySelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Community[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // 搜索小区
  useEffect(() => {
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
    onChange(community, false);
    setOpen(false);
    setQuery("");
  };

  // 使用新名称创建
  const handleCreateNew = async () => {
    if (!query) return;

    // 调用后端接口创建小区
    const result = await createCommunityAction({
      name: query,
      district: null,
      business_circle: null,
    });

    if (result) {
      // 创建成功，返回真实的小区数据
      const newCommunity: Community = {
        id: result.id,
        name: result.name,
        district: result.district || undefined,
        businessCircle: result.business_circle || undefined,
      };
      onChange(newCommunity, true);
      toast.success(`小区"${result.name}"已创建`);
    } else {
      toast.error("创建小区失败，请重试");
      // 即使创建失败，也允许前端继续使用输入的名称
      const fallbackCommunity: Community = {
        id: "",
        name: query,
      };
      onChange(fallbackCommunity, true);
    }

    setOpen(false);
    setQuery("");
  };

  // 样式配置
  const styles = {
    default: {
      label: "text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1",
      required: "text-red-500",
      button:
        "w-full h-12 justify-between rounded-xl px-4 text-left font-medium border-slate-200 hover:bg-slate-50 hover:text-slate-900",
      icon: "text-slate-400",
      placeholder: "text-slate-400 font-normal",
      popover: "w-[400px] p-0 rounded-xl",
      input:
        "w-full px-3 py-2 text-sm bg-slate-50 border rounded-lg outline-none focus:ring-2 focus:ring-primary/20",
      loading: "text-slate-400",
      createButton:
        "w-full flex items-center gap-2 p-3 text-sm text-primary bg-primary/5 hover:bg-primary/10 rounded-lg transition-colors font-bold",
      resultItem:
        "w-full flex items-center justify-between p-3 text-sm rounded-lg hover:bg-slate-100 transition-colors group text-left",
      resultItemActive: "bg-slate-50 text-primary font-bold",
      resultName: "font-bold text-slate-900",
      resultMeta: "text-[10px] text-slate-400 flex items-center gap-1",
      emptyState: "py-8 text-center text-slate-400 text-xs",
    },
    marketing: {
      label: "block text-xs font-bold text-[#707785] uppercase tracking-wider",
      required: "text-[#ba1a1a]",
      button:
        "w-full h-12 justify-between rounded-xl px-4 text-left font-medium border-[#c0c7d6]/50 hover:bg-[#e5eeff] hover:text-[#0b1c30] bg-white",
      icon: "text-[#707785]",
      placeholder: "text-[#707785] font-normal",
      popover: "w-[400px] p-0 rounded-xl",
      input:
        "w-full px-3 py-2 text-sm bg-[#f8f9ff] border border-[#c0c7d6]/30 rounded-lg outline-none focus:ring-2 focus:ring-[#005daa]/20",
      loading: "text-[#707785]",
      createButton:
        "w-full flex items-center gap-2 p-3 text-sm text-[#005daa] bg-[#005daa]/5 hover:bg-[#005daa]/10 rounded-lg transition-colors font-bold",
      resultItem:
        "w-full flex items-center justify-between p-3 text-sm rounded-lg hover:bg-[#eff4ff] transition-colors group text-left",
      resultItemActive: "bg-[#eff4ff] text-[#005daa] font-bold",
      resultName: "font-bold text-[#0b1c30]",
      resultMeta: "text-[10px] text-[#707785] flex items-center gap-1",
      emptyState: "py-8 text-center text-[#707785] text-xs",
    },
  };

  const s = styles[variant];

  return (
    <div className={cn("space-y-1.5", variant === "marketing" && "space-y-2", className)}>
      <label className={s.label}>
        {label} <span className={s.required}>*</span>
      </label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className={s.button}
            disabled={disabled}
          >
            <div className="flex items-center gap-2 truncate">
              <Building2 className={cn("h-4 w-4 shrink-0", s.icon)} />
              <span className={cn("truncate", !value && s.placeholder)}>
                {value || placeholder}
              </span>
            </div>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className={s.popover} align="start">
          {/* 搜索输入框 */}
          <div className={cn("p-2 border-b", variant === "marketing" && "border-[#c0c7d6]/20")}>
            <input
              className={s.input}
              placeholder="输入关键词搜索..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          {/* 搜索结果列表 */}
          <div className="max-h-[300px] overflow-y-auto p-1">
            {loading && (
              <div className={cn("flex items-center justify-center py-6", s.loading)}>
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
                <span className="text-xs">搜索中...</span>
              </div>
            )}

            {/* 新建选项 */}
            {!loading && results.length === 0 && query && allowCreate && (
              <div className="p-1">
                <button className={s.createButton} onClick={handleCreateNew}>
                  <Plus className="h-4 w-4" />
                  <span>使用新名称 &quot;{query}&quot;</span>
                </button>
              </div>
            )}

            {/* 搜索结果 */}
            {!loading &&
              results.map((community) => (
                <button
                  key={community.id}
                  className={cn(
                    s.resultItem,
                    value === community.name && s.resultItemActive
                  )}
                  onClick={() => handleSelect(community)}
                >
                  <div className="flex flex-col gap-0.5">
                    <span className={s.resultName}>{community.name}</span>
                    <span className={s.resultMeta}>
                      {community.district}{" "}
                      {community.businessCircle && `· ${community.businessCircle}`}
                    </span>
                  </div>
                  {value === community.name && <Check className="h-4 w-4" />}
                </button>
              ))}

            {/* 空状态提示 */}
            {!loading && !query && results.length === 0 && (
              <div className={s.emptyState}>请输入关键词查找小区</div>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
