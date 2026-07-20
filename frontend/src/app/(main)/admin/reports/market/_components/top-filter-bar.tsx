"use client";

/**
 * 商圈分析报表顶部筛选栏（Task 8 重构）。
 *
 * 上行：品牌图标 + 页面标题「商圈分析报表」+ 右对齐「最近更新」时间。
 * 下行：范围 / 来源 / 地区 三组筛选控件，flex 容器响应式换行。
 *
 * URL 状态通过 nuqs useQueryState 管理（shallow:false 触发服务端重渲染）：
 * - range: 4w / 8w / 6m / 12m / 24m，默认 4w
 * - sources: 逗号分隔 CSV 字符串，空串表示全部
 * - business_circles: 商圈名称模糊搜索（throttle 500ms）
 * - q: 小区名称模糊搜索（throttle 500ms）
 *
 * 地区筛选：商圈名称 Input + 小区名称 Input 两个搜索框（参考 property-filters.tsx）。
 * Level 2/3 通过 hideLocationSelector=true 隐藏搜索框。
 *
 * 字典数据（dataSources / lastUpdated）由父级 Server Component 预取后通过 props 传入。
 */
import { type ReactElement } from "react";
import { useQueryState } from "nuqs";
import { BarChart3, ChevronDown, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { RangeOption } from "../../_lib/types";

interface RangeOptionItem {
  value: RangeOption;
  label: string;
}

const RANGE_OPTIONS: readonly RangeOptionItem[] = [
  { value: "4w", label: "近4周" },
  { value: "8w", label: "近8周" },
  { value: "6m", label: "近6个月" },
  { value: "12m", label: "近12个月" },
  { value: "24m", label: "近24个月" },
];

interface TopFilterBarProps {
  dataSources: string[];
  lastUpdated: string;
  /**
   * 是否隐藏"地区"搜索框。
   * Level 1（默认 false/省略）：显示商圈/小区搜索框。
   * Level 2/3（true）：隐藏搜索框，仅保留范围/来源。
   */
  hideLocationSelector?: boolean;
}

export function TopFilterBar({
  dataSources,
  lastUpdated,
  hideLocationSelector = false,
}: TopFilterBarProps): ReactElement {
  // nuqs useQueryStates 不支持外层 throttleMs，改用独立 useQueryState 调用以获得 throttle 行为
  const [q, setQ] = useQueryState("q", {
    defaultValue: "",
    throttleMs: 500,
    shallow: false,
  });
  const [businessCircles, setBusinessCircles] = useQueryState(
    "business_circles",
    { defaultValue: "", throttleMs: 500, shallow: false },
  );
  const [range, setRange] = useQueryState("range", {
    defaultValue: "4w",
    shallow: false,
  });
  const [sources, setSources] = useQueryState("sources", {
    defaultValue: "",
    shallow: false,
  });

  // sources 用 CSV 字符串管理：读取时 split，写入时 join
  const sourcesList = sources ? sources.split(",") : [];

  // 来源展示文案
  const sourcesDisplay =
    sourcesList.length === 0 ? "全部" : sourcesList.join("、");

  const handleRangeChange = (val: string): void => {
    void setRange(val);
  };

  const handleToggleSource = (src: string): void => {
    const next = sourcesList.includes(src)
      ? sourcesList.filter((s) => s !== src)
      : [...sourcesList, src];
    void setSources(next.join(","));
  };

  return (
    <div className="space-y-4">
      {/* 顶部：品牌 + 标题 + 最近更新 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <BarChart3 className="size-5" aria-hidden="true" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">
            商圈分析报表
          </h1>
        </div>
        <span className="text-xs text-muted-foreground tabular-nums">
          最近更新: {lastUpdated}
        </span>
      </div>

      {/* 筛选区：范围 / 来源 / 地区 */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        {/* 范围 */}
        <div className="flex items-center gap-2">
          <Label className="text-xs font-medium text-muted-foreground whitespace-nowrap">
            范围
          </Label>
          <ToggleGroup
            type="single"
            value={range}
            onValueChange={(v) => {
              if (v) handleRangeChange(v);
            }}
            variant="outline"
            size="sm"
            className="flex flex-wrap items-center gap-1.5"
          >
            {RANGE_OPTIONS.map((opt) => (
              <ToggleGroupItem
                key={opt.value}
                value={opt.value}
                className="whitespace-nowrap"
              >
                {opt.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>

        {/* 来源 */}
        <div className="flex items-center gap-2">
          <Label className="text-xs font-medium text-muted-foreground whitespace-nowrap">
            来源
          </Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-8 w-28 justify-between font-normal"
              >
                <span className="truncate">{sourcesDisplay}</span>
                <ChevronDown className="size-3.5 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-40">
              <div className="space-y-2">
                {dataSources.map((src) => {
                  const id = `src-${src}`;
                  const checked = sourcesList.includes(src);
                  return (
                    <div key={src} className="flex items-center gap-2">
                      <Checkbox
                        id={id}
                        checked={checked}
                        onCheckedChange={() => handleToggleSource(src)}
                      />
                      <Label
                        htmlFor={id}
                        className="text-sm cursor-pointer"
                      >
                        {src}
                      </Label>
                    </div>
                  );
                })}
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {/* 地区：商圈名称 + 小区名称 搜索框（Level 2/3 通过 hideLocationSelector 隐藏） */}
        {!hideLocationSelector && (
          <div className="flex flex-wrap items-center gap-4">
            {/* 商圈名称 */}
            <div className="space-y-2">
              <Label className="text-xs font-medium text-muted-foreground whitespace-nowrap">
                商圈名称
              </Label>
              <div className="relative">
                <Search className="absolute left-2 top-2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="搜索商圈..."
                  className="pl-8 h-8 text-sm"
                  maxLength={50}
                  value={businessCircles || ""}
                  onChange={(e) => setBusinessCircles(e.target.value || null)}
                />
              </div>
            </div>

            {/* 小区名称 */}
            <div className="space-y-2">
              <Label className="text-xs font-medium text-muted-foreground whitespace-nowrap">
                小区名称
              </Label>
              <div className="relative">
                <Search className="absolute left-2 top-2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="搜索小区..."
                  className="pl-8 h-8 text-sm"
                  maxLength={50}
                  value={q || ""}
                  onChange={(e) => setQ(e.target.value || null)}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
