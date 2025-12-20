"use client";

import { useState } from "react";
import {
  getCoreRowModel,
  useReactTable,
  getPaginationRowModel,
  getFilteredRowModel,
  flexRender,
} from "@tanstack/react-table";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";

import { columns } from "./columns";
import { MergeDialog } from "./merge-dialog";
import { components } from "@/lib/api-types";

type Community = components["schemas"]["CommunityResponse"];

interface GovernanceViewProps {
  data: Community[];
  total: number;
}

export function GovernanceView({ data }: GovernanceViewProps) {


  // 1. 行选择状态
  const [rowSelection, setRowSelection] = useState({});
  
  // 2. 简单的前端搜索 (或者你可以用 nuqs 做服务端搜索，这里演示简单版)
  const [globalFilter, setGlobalFilter] = useState("");
// eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onRowSelectionChange: setRowSelection,
    onGlobalFilterChange: setGlobalFilter,
    state: {
      rowSelection,
      globalFilter,
    },
    // 指定 ID 字段，方便 selection 识别
    getRowId: (row) => String(row.id), 
  });

  // 获取当前选中的完整数据对象
  const selectedCommunities = table.getFilteredSelectedRowModel().rows.map((row) => row.original);

  return (
    <div className="space-y-4">
      {/* 工具栏 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="搜索小区名称..."
              value={globalFilter}
              onChange={(event) => setGlobalFilter(event.target.value)}
              className="pl-8 w-[300px]"
            />
          </div>
        </div>
        
        {/* 合并按钮 - 传入选中项 */}
        <MergeDialog 
          selectedCommunities={selectedCommunities} 
          onSuccess={() => setRowSelection({})} // 合并成功后清空选择
        />
      </div>

      {/* 表格区域 - 这里我们手动渲染 Table 以便完全控制 Selection，
          或者你可以复用 DataTable 组件，前提是它把 table 实例暴露出来或者支持传入 selection state 
          为了演示清晰，这里写一个简化的 Table 渲染
      */}
      <div className="rounded-md border bg-white">
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
      
      <div className="text-xs text-muted-foreground">
        共加载 {data.length} 条小区数据 (支持前端筛选合并)
      </div>
    </div>
  );
}