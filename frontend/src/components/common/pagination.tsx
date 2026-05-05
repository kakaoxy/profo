"use client";

import { useCallback, useMemo } from "react";
import { useQueryState, parseAsInteger } from "nuqs";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface PaginationBaseProps {
  totalItems: number;
  showPageSizeSelector?: boolean;
  showFirstLastButtons?: boolean;
  className?: string;
}

interface ControlledPaginationProps extends PaginationBaseProps {
  mode: "controlled";
  currentPage: number;
  totalPages: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
}

interface UrlPaginationProps extends PaginationBaseProps {
  mode: "url";
  pageParamName?: string;
  sizeParamName?: string;
}

type PaginationProps = ControlledPaginationProps | UrlPaginationProps;

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

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

export function Pagination(props: PaginationProps) {
  if (props.mode === "url") {
    return <UrlPagination {...props} />;
  }
  return <ControlledPagination {...props} />;
}

function ControlledPagination({
  currentPage,
  totalPages,
  pageSize,
  totalItems,
  showPageSizeSelector = false,
  showFirstLastButtons = true,
  onPageChange,
  onPageSizeChange,
  className,
}: ControlledPaginationProps) {
  const paginationItems = useMemo(
    () => generatePaginationItems(currentPage, totalPages),
    [currentPage, totalPages]
  );

  const handlePageSizeChange = useCallback(
    (value: string) => {
      const size = parseInt(value);
      onPageSizeChange?.(size);
    },
    [onPageSizeChange]
  );

  if (totalPages <= 1 && !showPageSizeSelector) {
    return (
      <div className={cn("flex items-center justify-between px-6 py-4 border-t border-border bg-muted", className)}>
        <div className="text-xs text-muted-foreground">
          {totalItems > 0 ? (
            <>
              共 <span className="font-medium">{totalItems}</span> 条记录
            </>
          ) : (
            <span>暂无数据</span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col sm:flex-row items-center justify-between gap-2 px-2 py-2 sm:py-4", className)}>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {totalItems > 0 ? (
          <>
            共 <span className="font-medium">{totalItems}</span> 条
          </>
        ) : (
          <span>暂无数据</span>
        )}
      </div>

      <div className="flex items-center gap-2 sm:gap-4">
        {showPageSizeSelector && onPageSizeChange && (
          <div className="hidden sm:flex items-center gap-2">
            <span className="text-sm font-medium">每页</span>
            <Select value={`${pageSize}`} onValueChange={handlePageSizeChange}>
              <SelectTrigger className="h-8 w-[70px]">
                <SelectValue placeholder={pageSize} />
              </SelectTrigger>
              <SelectContent side="top">
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <SelectItem key={size} value={`${size}`}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <span className="text-xs sm:text-sm font-medium whitespace-nowrap">
          {currentPage} / {totalPages}
        </span>

        <div className="flex items-center gap-1">
          {showFirstLastButtons && (
            <Button
              variant="outline"
              className="hidden h-8 w-8 p-0 lg:flex"
              onClick={() => onPageChange(1)}
              disabled={currentPage <= 1}
            >
              <span className="sr-only">首页</span>
              <ChevronsLeft className="h-4 w-4" />
            </Button>
          )}

          <Button
            variant="outline"
            className="h-8 w-8 p-0"
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage <= 1}
          >
            <span className="sr-only">上一页</span>
            <ChevronLeft className="h-4 w-4" />
          </Button>

          {paginationItems.map((item, index) =>
            item === "..." ? (
              <span key={`ellipsis-${index}`} className="px-1 text-muted-foreground text-sm">...</span>
            ) : (
              <Button
                key={item}
                variant={currentPage === item ? "default" : "outline"}
                className="h-8 w-8 p-0 text-sm"
                onClick={() => onPageChange(item as number)}
              >
                {item}
              </Button>
            )
          )}

          <Button
            variant="outline"
            className="h-8 w-8 p-0"
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage >= totalPages}
          >
            <span className="sr-only">下一页</span>
            <ChevronRight className="h-4 w-4" />
          </Button>

          {showFirstLastButtons && (
            <Button
              variant="outline"
              className="hidden h-8 w-8 p-0 lg:flex"
              onClick={() => onPageChange(totalPages)}
              disabled={currentPage >= totalPages}
            >
              <span className="sr-only">尾页</span>
              <ChevronsRight className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function UrlPagination({
  totalItems,
  showPageSizeSelector = true,
  showFirstLastButtons = true,
  pageParamName = "page",
  sizeParamName = "pageSize",
  className,
}: UrlPaginationProps) {
  const [page, setPage] = useQueryState(
    pageParamName,
    parseAsInteger.withDefault(1).withOptions({ shallow: false })
  );
  const [pageSize, setPageSize] = useQueryState(
    sizeParamName,
    parseAsInteger.withDefault(50).withOptions({ shallow: false })
  );

  const totalPages = Math.ceil(totalItems / pageSize);

  const handlePageSizeChange = useCallback(
    (value: string) => {
      const size = parseInt(value);
      setPageSize(size);
      setPage(1);
    },
    [setPage, setPageSize]
  );

  const handlePageChange = useCallback(
    (newPage: number) => {
      if (newPage >= 1 && newPage <= totalPages) {
        setPage(newPage);
      }
    },
    [setPage, totalPages]
  );

  const paginationItems = useMemo(
    () => generatePaginationItems(page, totalPages),
    [page, totalPages]
  );

  return (
    <div className={cn("flex flex-col sm:flex-row items-center justify-between gap-2 px-2 py-2 sm:py-4", className)}>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {totalItems > 0 ? (
          <>
            共 <span className="font-medium">{totalItems}</span> 条
          </>
        ) : (
          <span>暂无数据</span>
        )}
      </div>

      <div className="flex items-center gap-2 sm:gap-4">
        {showPageSizeSelector && (
          <div className="hidden sm:flex items-center gap-2">
            <span className="text-sm font-medium">每页</span>
            <Select value={`${pageSize}`} onValueChange={handlePageSizeChange}>
              <SelectTrigger className="h-8 w-[70px]">
                <SelectValue placeholder={pageSize} />
              </SelectTrigger>
              <SelectContent side="top">
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <SelectItem key={size} value={`${size}`}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <span className="text-xs sm:text-sm font-medium whitespace-nowrap">
          {page} / {totalPages}
        </span>

        <div className="flex items-center gap-1">
          {showFirstLastButtons && (
            <Button
              variant="outline"
              className="hidden h-8 w-8 p-0 lg:flex"
              onClick={() => handlePageChange(1)}
              disabled={page <= 1}
            >
              <span className="sr-only">首页</span>
              <ChevronsLeft className="h-4 w-4" />
            </Button>
          )}

          <Button
            variant="outline"
            className="h-8 w-8 p-0"
            onClick={() => handlePageChange(page - 1)}
            disabled={page <= 1}
          >
            <span className="sr-only">上一页</span>
            <ChevronLeft className="h-4 w-4" />
          </Button>

          {paginationItems.map((item, index) =>
            item === "..." ? (
              <span key={`ellipsis-${index}`} className="px-1 text-muted-foreground text-sm">...</span>
            ) : (
              <Button
                key={item}
                variant={page === item ? "default" : "outline"}
                className="h-8 w-8 p-0 text-sm"
                onClick={() => handlePageChange(item as number)}
              >
                {item}
              </Button>
            )
          )}

          <Button
            variant="outline"
            className="h-8 w-8 p-0"
            onClick={() => handlePageChange(page + 1)}
            disabled={page >= totalPages}
          >
            <span className="sr-only">下一页</span>
            <ChevronRight className="h-4 w-4" />
          </Button>

          {showFirstLastButtons && (
            <Button
              variant="outline"
              className="hidden h-8 w-8 p-0 lg:flex"
              onClick={() => handlePageChange(totalPages)}
              disabled={page >= totalPages}
            >
              <span className="sr-only">尾页</span>
              <ChevronsRight className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
