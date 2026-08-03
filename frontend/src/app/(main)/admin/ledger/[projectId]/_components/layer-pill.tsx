"use client";

import { cn } from "@/lib/utils";

/**
 * 层级 Pill — 按科目 level 1-7 显示不同颜色标签。
 *
 * 配色对齐设计文档 layer-pill（lp-1~lp-7）：
 * ①取得成本(红) ②直接改造成本(黄) ③交易费用(蓝) ④资金成本(橙)
 * ⑤现金流专属(浅蓝) ⑥收入项(绿) ⑦配对项(紫)
 */
const LEVEL_LABELS: Record<string, string> = {
  "1": "①取得成本",
  "2": "②直接改造成本",
  "3": "③交易费用",
  "4": "④资金成本",
  "5": "⑤现金流专属",
  "6": "⑥收入项",
  "7": "⑦配对项",
};

const LEVEL_PILL_CLASS: Record<string, string> = {
  "1": "bg-red-100 text-red-700 border-red-200",
  "2": "bg-amber-100 text-amber-700 border-amber-200",
  "3": "bg-blue-100 text-blue-700 border-blue-200",
  "4": "bg-orange-100 text-orange-700 border-orange-200",
  "5": "bg-sky-100 text-sky-700 border-sky-200",
  "6": "bg-green-100 text-green-700 border-green-200",
  "7": "bg-purple-100 text-purple-700 border-purple-200",
};

export interface LayerPillProps {
  level: string | number | null | undefined;
  className?: string;
}

export function LayerPill({ level, className }: LayerPillProps) {
  const key = level == null ? "" : String(level);
  const cls =
    LEVEL_PILL_CLASS[key] ?? "bg-muted text-muted-foreground border-border";
  const label = LEVEL_LABELS[key] ?? `L${key}`;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border whitespace-nowrap",
        cls,
        className,
      )}
    >
      {label}
    </span>
  );
}

export default LayerPill;
