"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

import { SteepButton } from "@/components/custom/steep-controls";

export function CompanyPagination({
  page,
  pageSize,
  total,
  onPageChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  if (total === 0) return null;

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  return (
    <nav
      aria-label="公司列表分页"
      className="flex flex-wrap items-center justify-between gap-3 px-1 text-[14px] leading-[1.5] text-graphite"
    >
      <p className="tabular-nums">
        共 {total} 家公司 · 第 {start}–{end} 家 · 第 {page} / {totalPages} 页
      </p>
      {totalPages > 1 ? (
        <div className="flex items-center gap-4">
          <SteepButton
            variant="text"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            <ChevronLeft />
            上一页
          </SteepButton>
          <SteepButton
            variant="text"
            disabled={page >= totalPages}
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
