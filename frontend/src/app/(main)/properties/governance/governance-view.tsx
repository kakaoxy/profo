"use client";

import { useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  getCoreRowModel,
  useReactTable,
  flexRender,
} from "@tanstack/react-table";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search } from "lucide-react";

import { columns } from "./columns";
import { MergeDialog } from "./merge-dialog";
import { components } from "@/lib/api-types";

type Community = components["schemas"]["CommunityResponse"];

interface GovernanceViewProps {
  data: Community[];
  total: number;
  page: number;
  pageSize: number;
}

export function GovernanceView({ data, total, page, pageSize }: GovernanceViewProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // 1. 行选择状态
  const [rowSelection, setRowSelection] = useState({});
  
  // 2. 搜索框状态（初始值为 URL 中的 search 参数）
  const [searchValue, setSearchValue] = useState(searchParams.get("search") || "");

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    // 移除客户端分页和筛选模型
    // getPaginationRowModel: getPaginationRowModel(), 
    // getFilteredRowModel: getFilteredRowModel(),
    manualPagination: true,
    manualFiltering: true,
    onRowSelectionChange: setRowSelection,
    state: {
      rowSelection,
    },
    getRowId: (row) => String(row.id), 
  });

  // 处理搜索
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams(searchParams);
    if (searchValue) {
      params.set("search", searchValue);
    } else {
      params.delete("search");
    }
    params.set("page", "1"); // 重置到第一页
    router.replace(`${pathname}?${params.toString()}`);
  };

  // 处理分页
  const totalPages = Math.ceil(total / pageSize);
  const handlePageChange = (newPage: number) => {
    if (newPage < 1 || newPage > totalPages) return;
    const params = new URLSearchParams(searchParams);
    params.set("page", String(newPage));
    router.replace(`${pathname}?${params.toString()}`);
  };

  // 获取当前选中的完整数据对象
  const selectedCommunities = table.getFilteredSelectedRowModel().rows.map((row) => row.original);

  return (
    <div className="space-y-4">
      {/* 工具栏 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <form onSubmit={handleSearch} className="relative flex items-center gap-2">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="搜索小区名称..."
              value={searchValue}
              onChange={(event) => setSearchValue(event.target.value)}
              className="pl-8 w-full sm:w-[300px]"
            />
            <Button type="submit" variant="secondary" size="sm">搜索</Button>
          </form>
        </div>
        
        {/* 合并按钮 - 传入选中项 */}
        <MergeDialog 
          selectedCommunities={selectedCommunities} 
          onSuccess={() => setRowSelection({})} // 合并成功后清空选择
        />
      </div>

      <div className="rounded-md border bg-white overflow-x-auto scrollbar-hide">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  暂无数据
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      
      {/* 分页控制栏 */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-2 px-2">
        <div className="text-xs sm:text-sm text-muted-foreground">
          共 {total} 条，第 {page}/{totalPages} 页
        </div>
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handlePageChange(page - 1)}
            disabled={page <= 1}
          >
            上一页
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handlePageChange(page + 1)}
            disabled={page >= totalPages}
          >
            下一页
          </Button>
        </div>
      </div>
    </div>
  );
}