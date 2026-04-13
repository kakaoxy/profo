"use client";

import { useMemo, useCallback } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  total: number;
  pageSize: number;
  isLoading?: boolean;
  onPageChange: (page: number) => void;
}

// 生成分页页码数组
function generatePaginationItems(currentPage: number, totalPages: number): (number | string)[] {
  const items: (number | string)[] = [];

  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) {
      items.push(i);
    }
  } else {
    if (currentPage <= 3) {
      items.push(1, 2, 3, 4, "...", totalPages);
    } else if (currentPage >= totalPages - 2) {
      items.push(1, "...", totalPages - 3, totalPages - 2, totalPages - 1, totalPages);
    } else {
      items.push(1, "...", currentPage - 1, currentPage, currentPage + 1, "...", totalPages);
    }
  }

  return items;
}

export function Pagination({
  currentPage,
  totalPages,
  total,
  pageSize,
  isLoading = false,
  onPageChange,
}: PaginationProps) {
  const startItem = total > 0 ? (currentPage - 1) * pageSize + 1 : 0;
  const endItem = Math.min(currentPage * pageSize, total);

  const paginationItems = useMemo(() => {
    return generatePaginationItems(currentPage, totalPages);
  }, [currentPage, totalPages]);

  const handlePrevPage = useCallback(() => {
    if (currentPage > 1 && !isLoading) {
      onPageChange(currentPage - 1);
    }
  }, [currentPage, isLoading, onPageChange]);

  const handleNextPage = useCallback(() => {
    if (currentPage < totalPages && !isLoading) {
      onPageChange(currentPage + 1);
    }
  }, [currentPage, totalPages, isLoading, onPageChange]);

  const handlePageClick = useCallback((page: number) => {
    if (!isLoading && page !== currentPage) {
      onPageChange(page);
    }
  }, [currentPage, isLoading, onPageChange]);

  if (totalPages <= 1) {
    return (
      <div className="px-6 py-4 bg-slate-50 flex items-center justify-between border-t border-slate-200">
        <div className="text-xs text-slate-500">
          {total > 0 ? (
            <>
              共 <span className="text-slate-700 font-medium">{total}</span> 个房源
            </>
          ) : (
            <span>暂无数据</span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="px-6 py-4 bg-slate-50 flex items-center justify-between border-t border-slate-200">
      <div className="text-xs text-slate-500">
        {total > 0 ? (
          <>
            显示 <span className="text-slate-700 font-medium">{startItem} - {endItem}</span> 之 <span className="text-slate-700 font-medium">{total}</span> 个房源
          </>
        ) : (
          <span>暂无数据</span>
        )}
      </div>

      <div className="flex items-center gap-1">
        {/* 上一页按钮 */}
        <button
          onClick={handlePrevPage}
          disabled={currentPage <= 1 || isLoading}
          className={cn(
            "w-8 h-8 flex items-center justify-center rounded-md border transition-all",
            currentPage <= 1 || isLoading
              ? "text-slate-300 cursor-not-allowed border-slate-200"
              : "text-slate-600 hover:bg-white hover:text-slate-900 hover:border-slate-300 border-slate-200"
          )}
          aria-label="上一页"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        {/* 页码按钮 */}
        {paginationItems.map((item, index) => (
          item === "..." ? (
            <span key={`ellipsis-${index}`} className="px-2 text-slate-400">...</span>
          ) : (
            <button
              key={item}
              onClick={() => handlePageClick(item as number)}
              disabled={isLoading}
              className={cn(
                "w-8 h-8 flex items-center justify-center rounded-md text-sm font-medium transition-all",
                currentPage === item
                  ? "bg-blue-600 text-white"
                  : "text-slate-600 hover:bg-white hover:text-slate-900"
              )}
            >
              {item}
            </button>
          )
        ))}

        {/* 下一页按钮 */}
        <button
          onClick={handleNextPage}
          disabled={currentPage >= totalPages || isLoading}
          className={cn(
            "w-8 h-8 flex items-center justify-center rounded-md border transition-all",
            currentPage >= totalPages || isLoading
              ? "text-slate-300 cursor-not-allowed border-slate-200"
              : "text-slate-600 hover:bg-white hover:text-slate-900 hover:border-slate-300 border-slate-200"
          )}
          aria-label="下一页"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
