"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

import { SteepButton } from "@/components/custom/steep-controls";

export function StorePagination({
  page,
  pageSize,
  total,
  totalPages,
  onPageChange,
  loading,
}: {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  loading: boolean;
}) {
  if (total === 0) return null;

  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  return (
    <nav
      aria-label="门店列表分页"
      className="flex flex-col gap-3 text-[14px] leading-[1.5] text-graphite sm:flex-row sm:items-center sm:justify-between"
    >
      <p className="tabular-nums">
        共 {total} 家门店
        <span className="mx-2 text-dove">·</span>第 {start}–{end} 家
        <span className="mx-2 text-dove">·</span>第 {page} / {totalPages} 页
      </p>
      {totalPages > 1 ? (
        <div className="flex items-center gap-4">
          <SteepButton
            variant="text"
            disabled={page <= 1 || loading}
            onClick={() => onPageChange(page - 1)}
          >
            <ChevronLeft />
            上一页
          </SteepButton>
          <SteepButton
            variant="text"
            disabled={page >= totalPages || loading}
            onClick={() => onPageChange(page + 1)}
          >
            下一页
            <ChevronRight />
          </SteepButton>
        </div>
      ) : null}
    </nav>
  );
}
