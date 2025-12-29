"use client";

import { useQueryState, parseAsInteger } from "nuqs";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface PropertyPaginationProps {
  total: number;
}

export function PropertyPagination({ total }: PropertyPaginationProps) {
  // 绑定 URL 参数，shallow: false 确保触发服务端请求
  const [page, setPage] = useQueryState("page", parseAsInteger.withDefault(1).withOptions({ shallow: false }));
  const [pageSize, setPageSize] = useQueryState("page_size", parseAsInteger.withDefault(50).withOptions({ shallow: false }));

  // 计算总页数
  const totalPages = Math.ceil(total / pageSize);

  // 处理每页数量变化
  const handlePageSizeChange = (value: string) => {
    const newSize = parseInt(value);
    setPageSize(newSize);
    setPage(1); // 改变每页大小时，重置回第一页，防止页码越界
  };

  // 辅助函数：安全跳转
  const goToPage = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setPage(newPage);
    }
  };

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-2 px-2 py-2 sm:py-4">
      {/* 左侧：总数显示 */}
      <div className="text-xs sm:text-sm text-muted-foreground">
        共 {total} 条
      </div>

      {/* 右侧：分页控制区 */}
      <div className="flex items-center gap-2 sm:gap-4 lg:gap-8">
        {/* 2. 当前页码状态 */}
        <div className="text-xs sm:text-sm font-medium whitespace-nowrap">
          {page} / {totalPages}
        </div>

        {/* 1. 每页行数选择器 - 仅在 sm 及以上显示 */}
        <div className="hidden sm:flex items-center gap-2">
          <p className="text-sm font-medium">每页</p>
          <Select
            value={`${pageSize}`}
            onValueChange={handlePageSizeChange}
          >
            <SelectTrigger className="h-8 w-[70px]">
              <SelectValue placeholder={pageSize} />
            </SelectTrigger>
            <SelectContent side="top">
              {[10, 20, 50, 100].map((size) => (
                <SelectItem key={size} value={`${size}`}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

       

        {/* 3. 翻页按钮组 */}
        <div className="flex items-center gap-1 sm:gap-2">
          {/* 首页 */}
          <Button
            variant="outline"
            className="hidden h-8 w-8 p-0 lg:flex"
            onClick={() => goToPage(1)}
            disabled={page <= 1}
          >
            <span className="sr-only">Go to first page</span>
            <ChevronsLeft className="h-4 w-4" />
          </Button>
          
          {/* 上一页 */}
          <Button
            variant="outline"
            className="h-8 w-8 p-0"
            onClick={() => goToPage(page - 1)}
            disabled={page <= 1}
          >
            <span className="sr-only">Go to previous page</span>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          
          {/* 下一页 */}
          <Button
            variant="outline"
            className="h-8 w-8 p-0"
            onClick={() => goToPage(page + 1)}
            disabled={page >= totalPages}
          >
            <span className="sr-only">Go to next page</span>
            <ChevronRight className="h-4 w-4" />
          </Button>
          
          {/* 尾页 */}
          <Button
            variant="outline"
            className="hidden h-8 w-8 p-0 lg:flex"
            onClick={() => goToPage(totalPages)}
            disabled={page >= totalPages}
          >
            <span className="sr-only">Go to last page</span>
            <ChevronsRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}