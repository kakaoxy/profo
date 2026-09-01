"use client";

import { cn } from "@/lib/utils";

interface DesignPaginationProps {
  /** 左侧信息文本，如「共 96 条 · 第 1/10 页」 */
  info: string;
  page: number;
  totalPages: number;
  onPageChange?: (page: number) => void;
}

/** 页号生成：≤7 页全量展示，超过时首尾 + 省略号（同 common/pagination 策略） */
function generateItems(page: number, totalPages: number): (number | string)[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  if (page <= 3) {
    return [1, 2, 3, 4, "...", totalPages];
  }
  if (page >= totalPages - 2) {
    return [1, "...", totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
  }
  return [1, "...", page - 1, page, page + 1, "...", totalPages];
}

/**
 * 设计稿分页脚：左「pg-info」+ 右「pg-btns」。
 * 32px 方形按钮、10px 圆角；激活态 Ink 底白字，禁用态 35% 透明度。
 */
export function DesignPagination({ info, page, totalPages, onPageChange }: DesignPaginationProps) {
  const items = generateItems(page, totalPages);

  return (
    <div className="flex items-center justify-between px-6 py-4 border-t border-fog">
      <div className="text-[13px] text-graphite">{info}</div>
      <div className="flex gap-1.5">
        <button
          type="button"
          className="pg-btn min-w-8 h-8 px-2 rounded-[10px] border border-fog bg-white text-[13px] font-medium text-ink flex items-center justify-center disabled:opacity-35 disabled:cursor-not-allowed hover:border-dove transition-colors"
          disabled={page <= 1}
          onClick={() => onPageChange?.(page - 1)}
          aria-label="上一页"
        >
          ‹
        </button>
        {items.map((item, index) =>
          item === "..." ? (
            <span
              key={`ellipsis-${index}`}
              className="min-w-8 h-8 px-1 flex items-center justify-center text-[13px] text-graphite"
            >
              …
            </span>
          ) : (
            <button
              key={item}
              type="button"
              className={cn(
                "min-w-8 h-8 px-2 rounded-[10px] border text-[13px] font-medium flex items-center justify-center transition-colors",
                item === page
                  ? "bg-ink border-ink text-white"
                  : "border-fog bg-white text-ink hover:border-dove",
              )}
              onClick={() => onPageChange?.(item as number)}
              aria-current={item === page ? "page" : undefined}
            >
              {item}
            </button>
          ),
        )}
        <button
          type="button"
          className="min-w-8 h-8 px-2 rounded-[10px] border border-fog bg-white text-[13px] font-medium text-ink flex items-center justify-center disabled:opacity-35 disabled:cursor-not-allowed hover:border-dove transition-colors"
          disabled={page >= totalPages}
          onClick={() => onPageChange?.(page + 1)}
          aria-label="下一页"
        >
          ›
        </button>
      </div>
    </div>
  );
}
