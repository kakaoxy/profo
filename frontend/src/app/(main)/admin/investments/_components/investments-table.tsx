"use client";

import Link from "next/link";
import { ColumnDef } from "@tanstack/react-table";
import { Eye, Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import type { components } from "@/lib/api-types";
import { formatCNY, formatPercent } from "@/lib/formatters";
import { getProjectStatusBadgeClass, getStatusLabel, DEFAULT_STATUS } from "@/lib/status-colors";
import { HasPermission } from "@/components/has-permission";
import { PERMISSION_CODES } from "@/lib/auth/permissions";

type InvestmentListItem = components["schemas"]["InvestmentListItemResponse"];

interface InvestmentsTableProps {
  data: InvestmentListItem[];
  onRowClick?: (row: InvestmentListItem) => void;
}

function SettlementStatusCell({ status }: { status: string }) {
  if (status === "settled") {
    return (
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-emerald-500" />
        <span className="text-sm text-foreground">已结算</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <span className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
      <span className="text-sm text-foreground">未结算</span>
    </div>
  );
}

function ReturnRatioCell({ ratio }: { ratio: number }) {
  const colorClass =
    ratio > 0 ? "text-money-positive" : ratio < 0 ? "text-money-negative" : "text-muted-foreground";
  return (
    <span className={`font-mono text-sm font-semibold tabular-nums ${colorClass}`}>
      {formatPercent(ratio)}
    </span>
  );
}

function ActionCell({ row }: { row: InvestmentListItem }) {
  const viewHref = `/admin/investments/${row.project_id}`;
  const editHref = `/admin/investments/${row.project_id}?edit=1`;
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
      <HasPermission code={PERMISSION_CODES.INVESTMENT_WRITE}>
        <Link href={editHref} onClick={stop} title="编辑">
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-foreground hover:bg-muted h-8 w-8 p-0 rounded-full"
            aria-label="编辑"
          >
            <Pencil className="h-4 w-4" />
          </Button>
        </Link>
      </HasPermission>
    </div>
  );
}

function buildColumns(): ColumnDef<InvestmentListItem>[] {
  return [
    {
      accessorKey: "project_code",
      header: () => <div className="text-muted-foreground font-medium">项目编号</div>,
      cell: ({ row }) => (
        <span className="font-mono text-xs text-muted-foreground">
          {row.original.project_code || "-"}
        </span>
      ),
    },
    {
      accessorKey: "project_name",
      header: () => <div className="text-muted-foreground font-medium">小区 / 地址</div>,
      cell: ({ row }) => (
        <div className="flex flex-col py-1 min-w-35">
          <span className="font-medium text-sm text-foreground truncate max-w-55">
            {row.original.project_name || "-"}
          </span>
          {row.original.project_address ? (
            <span className="text-xs text-muted-foreground mt-0.5 truncate max-w-55">
              {row.original.project_address}
            </span>
          ) : null}
        </div>
      ),
    },
    {
      accessorKey: "project_status",
      header: () => <div className="text-muted-foreground font-medium">项目状态</div>,
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
      accessorKey: "settlement_status",
      header: () => <div className="text-muted-foreground font-medium">跟投状态</div>,
      cell: ({ row }) => <SettlementStatusCell status={row.original.settlement_status} />,
    },
    {
      accessorKey: "total_investment",
      header: () => <div className="text-right text-muted-foreground font-medium">投资总额</div>,
      cell: ({ row }) => (
        <div className="text-right">
          <div className="font-mono text-sm font-medium text-foreground tabular-nums">
            {formatCNY(row.original.total_investment)}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            ({row.original.investor_count} 位投资人)
          </div>
        </div>
      ),
    },
    {
      accessorKey: "total_return",
      header: () => <div className="text-right text-muted-foreground font-medium">收益总额</div>,
      cell: ({ row }) => (
        <div className="text-right font-mono text-sm font-medium text-foreground tabular-nums">
          {formatCNY(row.original.total_return)}
        </div>
      ),
    },
    {
      accessorKey: "return_ratio",
      header: () => <div className="text-right text-muted-foreground font-medium">回报率</div>,
      cell: ({ row }) => (
        <div className="text-right">
          <ReturnRatioCell ratio={row.original.return_ratio} />
        </div>
      ),
    },
    {
      id: "actions",
      header: () => <div className="text-center text-muted-foreground font-medium">操作</div>,
      cell: ({ row }) => <ActionCell row={row.original} />,
    },
  ];
}

export function InvestmentsTable({ data, onRowClick }: InvestmentsTableProps) {
  const columns = buildColumns();
  return (
    <div className="bg-card rounded-lg border border-border shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <DataTable columns={columns} data={data} onRowClick={onRowClick} container={false} />
      </div>
    </div>
  );
}
