"use client";

import { useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { parseAsInteger, parseAsString, useQueryStates } from "nuqs";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from "@tanstack/react-table";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { buildColumns } from "./business-district-columns";
import type { BusinessDistrictRow } from "../../_lib/types";

interface BusinessDistrictTableProps {
  initialItems: BusinessDistrictRow[];
  initialTotal: number;
  compareIds: string[];
}

const VALID_SORT_KEYS = [
  "sold_count",
  "avg_price_wan",
  "avg_unit_price",
  "on_sale_count",
  "absorption_months",
  "price_qoq",
  "volume_qoq",
] as const;

const MAX_COMPARE = 5;

function parseCompareIds(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function BusinessDistrictTable({
  initialItems,
  initialTotal,
  compareIds,
}: BusinessDistrictTableProps) {
  const router = useRouter();
  const [query, setQuery] = useQueryStates(
    {
      sort_by: parseAsString.withDefault("sold_count"),
      sort_order: parseAsString.withDefault("desc"),
      page: parseAsInteger.withDefault(1),
      page_size: parseAsInteger.withDefault(20),
      compare_ids: parseAsString.withDefault(""),
    },
    { shallow: false },
  );

  const sortBy = VALID_SORT_KEYS.includes(
    query.sort_by as (typeof VALID_SORT_KEYS)[number],
  )
    ? query.sort_by
    : "sold_count";
  const sortOrder: "asc" | "desc" = query.sort_order === "asc" ? "asc" : "desc";
  const page = Math.max(1, query.page);
  const pageSize = Math.max(1, query.page_size);

  // URL 中的 compare_ids 为权威来源；prop 作为 SSR 初值兼容
  const effectiveCompareIds = useMemo(
    () =>
      query.compare_ids
        ? parseCompareIds(query.compare_ids)
        : compareIds,
    [query.compare_ids, compareIds],
  );

  const handleSortChange = useCallback(
    (column: string) => {
      const nextOrder: "asc" | "desc" =
        column === sortBy && sortOrder === "asc" ? "desc" : "asc";
      void setQuery({
        sort_by: column,
        sort_order: nextOrder,
        page: 1,
      });
    },
    [sortBy, sortOrder, setQuery],
  );

  const handleAddToCompare = useCallback(
    (bc: string) => {
      if (effectiveCompareIds.includes(bc)) return;
      if (effectiveCompareIds.length >= MAX_COMPARE) return;
      const next = [...effectiveCompareIds, bc];
      void setQuery({ compare_ids: next.join(",") });
    },
    [effectiveCompareIds, setQuery],
  );

  const columns = useMemo<ColumnDef<BusinessDistrictRow>[]>(
    () =>
      buildColumns({
        sortBy,
        sortOrder,
        onSortChange: handleSortChange,
        compareIds: effectiveCompareIds,
        onAddToCompare: handleAddToCompare,
      }),
    [
      sortBy,
      sortOrder,
      handleSortChange,
      effectiveCompareIds,
      handleAddToCompare,
    ],
  );

  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Table 返回非可记忆函数，React Compiler 会跳过该组件记忆化
  const table = useReactTable({
    data: initialItems,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualSorting: true,
  });

  const handleRowClick = useCallback(
    (row: BusinessDistrictRow) => {
      const bc = row.business_circle || "未分类";
      router.push(
        `/admin/reports/communities?business_circles=${encodeURIComponent(bc)}`,
      );
    },
    [router],
  );

  const totalPages = Math.max(1, Math.ceil(initialTotal / pageSize));
  const showPagination = initialTotal > pageSize;
  const rangeStart = initialTotal === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, initialTotal);

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2">
          <span>商圈列表</span>
          <Badge variant="secondary" className="text-xs">
            共 {initialTotal} 个
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="bg-muted/30">
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
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
                  onClick={() => handleRowClick(row.original)}
                  className="cursor-pointer hover:bg-muted/50"
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center text-muted-foreground"
                >
                  暂无数据
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
      {showPagination && (
        <div className="flex flex-col gap-2 border-t px-6 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs text-muted-foreground">
            显示 {rangeStart}-{rangeEnd} 条 / 共 {initialTotal} 条
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => void setQuery({ page: page - 1 })}
            >
              <ChevronLeft className="h-4 w-4" />
              上一页
            </Button>
            <span className="px-2 text-sm text-muted-foreground">
              {page} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => void setQuery({ page: page + 1 })}
            >
              下一页
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
