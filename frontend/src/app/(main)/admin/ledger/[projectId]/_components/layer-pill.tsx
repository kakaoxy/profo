import { cn } from "@/lib/utils";
import {
  LEVEL_LABELS,
  LEVEL_PILL_CLASS,
} from "@/app/(main)/admin/ledger/subjects/_components/subject-schema";

/**
 * 层级 Pill — 按科目 level 1-7 显示不同颜色标签。
 *
 * 配色对齐设计文档 layer-pill（lp-1~lp-7）：
 * ①取得成本(红) ②直接改造成本(黄) ③交易费用(蓝) ④资金成本(橙)
 * ⑤现金流专属(浅蓝) ⑥收入项(绿) ⑦配对项(紫)
 *
 * 常量（LEVEL_LABELS / LEVEL_PILL_CLASS）以 subject-schema.ts 为单一来源，
 * subject-select-panel 等其它组件复用本组件，避免重复定义。
 */
export interface LayerPillProps {
  level: string | number | null | undefined;
  className?: string;
}

export function LayerPill({ level, className }: LayerPillProps) {
  const key = level == null ? "" : String(level);
  const cls =
    (LEVEL_PILL_CLASS as Record<string, string>)[key] ??
    "bg-muted text-muted-foreground border-border";
  const label = (LEVEL_LABELS as Record<string, string>)[key] ?? `L${key}`;
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
