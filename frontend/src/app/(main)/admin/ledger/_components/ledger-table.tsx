"use client";

import Link from "next/link";
import { ColumnDef } from "@tanstack/react-table";
import { Eye } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import type { components } from "@/lib/api-types";
import { formatCNY, formatPercent } from "@/lib/formatters";
import {
  getProjectStatusBadgeClass,
  getStatusLabel,
  DEFAULT_STATUS,
} from "@/lib/status-colors";

type LedgerProjectListItem = components["schemas"]["LedgerProjectListItem"];

interface LedgerTableProps {
  data: LedgerProjectListItem[];
  onRowClick?: (row: LedgerProjectListItem) => void;
}

function NetCashFlowCell({ value }: { value: number }) {
  const colorClass =
    value > 0
      ? "text-red-600 dark:text-red-400"
      : value < 0
        ? "text-emerald-600 dark:text-emerald-400"
        : "text-muted-foreground";
  return (
    <span className={`font-mono text-sm font-medium tabular-nums ${colorClass}`}>
      {formatCNY(value)}
    </span>
  );
}

function RoiCell({ ratio }: { ratio: number }) {
  const colorClass =
    ratio > 0
      ? "text-red-600 dark:text-red-400"
      : ratio < 0
        ? "text-emerald-600 dark:text-emerald-400"
        : "text-muted-foreground";
  return (
    <span className={`font-mono text-sm font-semibold tabular-nums ${colorClass}`}>
      {formatPercent(ratio)}
    </span>
  );
}

function ActionCell({ row }: { row: LedgerProjectListItem }) {
  const viewHref = `/admin/ledger/${row.project_id}`;
  const stop = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <div className="flex items-center justify-center gap-1">
      <Link href={viewHref} onClick={stop} title="查看">
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground hover:text-primary hover:bg-primary/10 h-8 w-8 p-0 rounded-full"
          aria-label="查看"
        >
          <Eye className="h-4 w-4" />
        </Button>
      </Link>
    </div>
  );
}

function buildColumns(): ColumnDef<LedgerProjectListItem>[] {
  return [
    {
      accessorKey: "project_code",
      header: () => (
        <div className="text-muted-foreground font-medium">项目编号</div>
      ),
      cell: ({ row }) => (
        <span className="font-mono text-xs text-muted-foreground">
          {row.original.project_code || "-"}
        </span>
      ),
    },
    {
      accessorKey: "project_name",
      header: () => (
        <div className="text-muted-foreground font-medium">小区 / 地址</div>
      ),
      cell: ({ row }) => (
        <div className="flex flex-col py-1 min-w-[140px]">
          <span className="font-medium text-sm text-foreground truncate max-w-[220px]">
            {row.original.project_name || "-"}
          </span>
          {row.original.project_address ? (
            <span className="text-xs text-muted-foreground mt-0.5 truncate max-w-[220px]">
              {row.original.project_address}
            </span>
          ) : null}
        </div>
      ),
    },
    {
      accessorKey: "project_status",
      header: () => (
        <div className="text-muted-foreground font-medium">项目状态</div>
      ),
      cell: ({ row }) => {
        const status = row.original.project_status || DEFAULT_STATUS;
        return (
          <Badge
            variant="secondary"
            className={`px-3 py-1 text-xs font-semibold rounded-lg border-none shadow-none ${getProjectStatusBadgeClass(status)}`}
          >
            {getStatusLabel(status)}
          </Badge>
        );
      },
    },
    {
      accessorKey: "total_income",
      header: () => (
        <div className="text-right text-muted-foreground font-medium">
          总收入
        </div>
      ),
      cell: ({ row }) => (
        <div className="text-right font-mono text-sm font-medium text-foreground tabular-nums">
          {formatCNY(row.original.total_income)}
        </div>
      ),
    },
    {
      accessorKey: "total_expense",
      header: () => (
        <div className="text-right text-muted-foreground font-medium">
          总支出
        </div>
      ),
      cell: ({ row }) => (
        <div className="text-right font-mono text-sm font-medium text-foreground tabular-nums">
          {formatCNY(row.original.total_expense)}
        </div>
      ),
    },
    {
      accessorKey: "net_cash_flow",
      header: () => (
        <div className="text-right text-muted-foreground font-medium">
          净现金流
        </div>
      ),
      cell: ({ row }) => (
        <div className="text-right">
          <NetCashFlowCell value={row.original.net_cash_flow} />
        </div>
      ),
    },
    {
      accessorKey: "roi",
      header: () => (
        <div className="text-right text-muted-foreground font-medium">ROI</div>
      ),
      cell: ({ row }) => (
        <div className="text-right">
          <RoiCell ratio={row.original.roi} />
        </div>
      ),
    },
    {
      accessorKey: "record_count",
      header: () => (
        <div className="text-center text-muted-foreground font-medium">
          记录数
        </div>
      ),
      cell: ({ row }) => (
        <div className="text-center font-mono text-sm text-foreground tabular-nums">
          {row.original.record_count}
        </div>
      ),
    },
    {
      id: "actions",
      header: () => (
        <div className="text-center text-muted-foreground font-medium">
          操作
        </div>
      ),
      cell: ({ row }) => <ActionCell row={row.original} />,
    },
  ];
}

export function LedgerTable({
  data,
  onRowClick,
}: LedgerTableProps) {
  const columns = buildColumns();
  return (
    <div className="bg-card rounded-lg border border-border shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <DataTable
          columns={columns}
          data={data}
          onRowClick={onRowClick}
          container={false}
        />
      </div>
    </div>
  );
}
