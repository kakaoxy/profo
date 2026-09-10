"use client";

import Link from "next/link";
import { ColumnDef } from "@tanstack/react-table";
import { Eye, HandCoins } from "lucide-react";
import { DataTable } from "@/components/ui/data-table";
import type { components } from "@/lib/api-types";
import { formatPercent } from "@/lib/formatters";
import { DEFAULT_STATUS, getStatusLabel } from "@/lib/status-colors";
import { formatYuanToWan, formatYuanToWanSigned } from "@/lib/format-amount";

type LedgerProjectListItem = components["schemas"]["LedgerProjectListItem"];

interface LedgerTableProps {
  data: LedgerProjectListItem[];
  onRowClick?: (row: LedgerProjectListItem) => void;
}

/**
 * Steep 单色项目状态徽章：在售＝Ink 填充、已售＝Dove、已签约/装修中＝Fog。
 * 替换原 getProjectStatusBadgeClass 的彩色方案（chrome 单色硬约束）。
 * 文案仍复用 status-colors 的 getStatusLabel，避免两处 label 漂移。
 */
const STEEP_STATUS_BADGE: Record<string, string> = {
  selling: "bg-ink text-white",
  sold: "bg-dove/20 text-dove",
  signing: "bg-fog text-ash",
  renovating: "bg-fog text-ash",
};
const FALLBACK_STATUS_BADGE = "bg-fog text-ash";

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-[10px] px-3 py-1 text-xs font-medium ${
        STEEP_STATUS_BADGE[status] ?? FALLBACK_STATUS_BADGE
      }`}
    >
      {getStatusLabel(status)}
    </span>
  );
}

function MoneyCell({ value }: { value?: number | null }) {
  return <span className="font-mono text-sm tabular-nums text-ink">{formatYuanToWan(value)}</span>;
}

function NetCashFlowCell({ value }: { value: number }) {
  const colorClass =
    value > 0 ? "text-money-positive" : value < 0 ? "text-money-negative" : "text-graphite";
  return (
    <span className={`font-mono text-sm font-medium tabular-nums ${colorClass}`}>
      {formatYuanToWanSigned(value)}
    </span>
  );
}

function RoiCell({ ratio }: { ratio: number }) {
  const colorClass =
    ratio > 0 ? "text-money-positive" : ratio < 0 ? "text-money-negative" : "text-graphite";
  return (
    <span className={`font-mono text-sm font-medium tabular-nums ${colorClass}`}>
      {formatPercent(ratio)}
    </span>
  );
}

/** 行内图标操作：低强调常显（DataTable 未提供 group 钩子，故不做 hover 隐形） */
function IconAction({
  href,
  label,
  children,
}: {
  href: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      onClick={(e) => e.stopPropagation()}
      title={label}
      aria-label={label}
      className="inline-flex h-8 w-8 items-center justify-center rounded-full text-dove transition-colors hover:bg-apricot-wash/60 hover:text-rust focus-visible:ring-2 focus-visible:ring-rust/40 focus-visible:outline-none"
    >
      {children}
    </Link>
  );
}

function buildColumns(): ColumnDef<LedgerProjectListItem>[] {
  return [
    {
      accessorKey: "project_code",
      header: () => <div className="font-medium text-graphite">项目编号</div>,
      cell: ({ row }) => (
        <span className="font-mono text-xs text-graphite">{row.original.project_code || "-"}</span>
      ),
    },
    {
      accessorKey: "project_name",
      header: () => <div className="font-medium text-graphite">小区 / 地址</div>,
      cell: ({ row }) => (
        <div className="flex min-w-35 flex-col py-1">
          <span className="max-w-55 truncate text-sm font-medium text-ink">
            {row.original.project_name || "-"}
          </span>
          {row.original.project_address ? (
            <span className="mt-0.5 max-w-55 truncate text-xs text-graphite">
              {row.original.project_address}
            </span>
          ) : null}
        </div>
      ),
    },
    {
      accessorKey: "project_status",
      header: () => <div className="font-medium text-graphite">项目状态</div>,
      cell: ({ row }) => <StatusBadge status={row.original.project_status || DEFAULT_STATUS} />,
    },
    {
      accessorKey: "total_income",
      header: () => <div className="text-right font-medium text-graphite">总收入</div>,
      cell: ({ row }) => (
        <div className="text-right">
          <MoneyCell value={row.original.total_income} />
        </div>
      ),
    },
    {
      accessorKey: "total_expense",
      header: () => <div className="text-right font-medium text-graphite">总支出</div>,
      cell: ({ row }) => (
        <div className="text-right">
          <MoneyCell value={row.original.total_expense} />
        </div>
      ),
    },
    {
      accessorKey: "net_cash_flow",
      header: () => <div className="text-right font-medium text-graphite">净现金流</div>,
      cell: ({ row }) => (
        <div className="text-right">
          <NetCashFlowCell value={row.original.net_cash_flow} />
        </div>
      ),
    },
    {
      accessorKey: "roi",
      header: () => <div className="text-right font-medium text-graphite">ROI</div>,
      cell: ({ row }) => (
        <div className="text-right">
          <RoiCell ratio={row.original.roi} />
        </div>
      ),
    },
    {
      accessorKey: "record_count",
      header: () => <div className="text-center font-medium text-graphite">记录数</div>,
      cell: ({ row }) => (
        <div className="text-center font-mono text-sm text-graphite tabular-nums">
          {row.original.record_count}
        </div>
      ),
    },
    {
      id: "investment",
      header: () => <div className="text-center font-medium text-graphite">跟投</div>,
      cell: ({ row }) => (
        <div className="flex items-center justify-center">
          <IconAction href={`/admin/investments/${row.original.project_id}`} label="跟投">
            <HandCoins className="h-4 w-4" aria-hidden="true" />
          </IconAction>
        </div>
      ),
    },
    {
      id: "actions",
      header: () => <div className="text-center font-medium text-graphite">操作</div>,
      cell: ({ row }) => (
        <div className="flex items-center justify-center">
          <IconAction href={`/admin/ledger/${row.original.project_id}`} label="查看">
            <Eye className="h-4 w-4" aria-hidden="true" />
          </IconAction>
        </div>
      ),
    },
  ];
}

// 模块级常量:buildColumns 无任何组件作用域闭包依赖,提升到模块作用域
// 避免每次渲染重建数组与内联 cell/header 函数,从而击穿 DataTable 内部 memo
const columns = buildColumns();

export function LedgerTable({ data, onRowClick }: LedgerTableProps) {
  return (
    <div className="overflow-hidden rounded-cards bg-white shadow-steep">
      {/* 无需再包一层 overflow-x-auto：ui/table.tsx 的 table-container 已自带横向滚动 */}
      <DataTable columns={columns} data={data} onRowClick={onRowClick} container={false} />
    </div>
  );
}
