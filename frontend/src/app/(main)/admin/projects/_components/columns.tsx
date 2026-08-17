"use client";

import { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { Project } from "../types";
import { ActionCell, ProjectTableMeta } from "./action-cell";
import { getStatusLabel, DEFAULT_STATUS } from "@/lib/status-colors";

/** Steep 风格项目状态徽章映射（仅本列表页使用，勿改全局 status-colors） */
const STEEP_STATUS_BADGE_CLASS: Record<string, string> = {
  signing: "bg-sky-wash text-ink",
  renovating: "bg-apricot-wash text-rust",
  selling: "bg-ink text-white",
  sold: "bg-fog text-ash",
  ended: "bg-fog text-dove",
};
const getSteepStatusBadgeClass = (status: string) =>
  STEEP_STATUS_BADGE_CLASS[status] || "bg-fog text-ash";

const formatMoney = (value: number | undefined | null) => {
  if (value === undefined || value === null) return "-";
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    minimumFractionDigits: 2,
  }).format(value);
};

const formatWan = (value: number | string | undefined | null) => {
  if (!value) return "-";
  return `${value}`;
};

const BUSINESS_FORM_LABEL: Record<string, string> = {
  agent: "代理美化",
  wholesale: "收购美化",
};

function getBusinessFormLabel(form: string | null | undefined): string | null {
  if (!form) return null;
  return BUSINESS_FORM_LABEL[form] || null;
}

export const columns: ColumnDef<Project>[] = [
  {
    accessorKey: "name",
    header: "项目名称 / 合同编号",
    cell: ({ row }) => {
      const status = row.original.status || DEFAULT_STATUS;

      return (
        <div className="flex flex-col py-1 min-w-35">
          <span className="font-medium text-ink text-[15px] truncate max-w-50 md:max-w-xs">
            {row.original.name}
          </span>

          <div className="flex items-center gap-2 mt-1">
            <span className="text-[11px] text-graphite font-mono tracking-tight">
              合同编号: {row.original.contract_no || "-"}
            </span>
            <Badge
              variant="secondary"
              className={`md:hidden text-[10px] px-1.5 py-0 h-5 border-none rounded-full ${getSteepStatusBadgeClass(status)}`}
            >
              {getStatusLabel(status)}
            </Badge>
          </div>
        </div>
      );
    },
  },
  {
    accessorKey: "community_name",
    header: () => <div className="hidden lg:block text-graphite font-medium">小区</div>,
    cell: ({ row }) => (
      <span className="hidden lg:block text-sm text-ink font-medium truncate max-w-30">
        {row.original.community_name || "-"}
      </span>
    ),
  },
  {
    accessorKey: "status",
    header: () => <div className="hidden md:block pl-2 text-graphite font-medium">状态</div>,
    cell: ({ row }) => {
      const status = row.original.status || DEFAULT_STATUS;
      const businessFormLabel = getBusinessFormLabel(row.original.business_form);

      return (
        <div className="hidden md:block space-y-1">
          <Badge
            variant="secondary"
            className={`px-3 py-1 text-xs font-semibold rounded-full border-none ${getSteepStatusBadgeClass(status)}`}
          >
            {getStatusLabel(status)}
          </Badge>
          {businessFormLabel && (
            <div>
              <Badge className="px-2 py-0.5 text-[10px] font-medium rounded-full text-ash bg-fog border-none">
                {businessFormLabel}
              </Badge>
            </div>
          )}
        </div>
      );
    },
  },
  {
    accessorKey: "signing_price",
    header: () => (
      <div className="hidden sm:block text-right pr-4 text-graphite font-medium">签约价(万)</div>
    ),
    cell: ({ row }) => (
      <div className="hidden sm:block text-right pr-4 font-medium text-ink tabular-nums">
        {formatWan(row.original.signing_price)}
      </div>
    ),
  },
  {
    accessorKey: "sold_price",
    header: () => (
      <div className="hidden sm:block text-right pr-4 text-graphite font-medium">成交价(万)</div>
    ),
    cell: ({ row }) => (
      <div className="hidden sm:block text-right pr-4 font-medium text-ink tabular-nums">
        {formatWan(row.original.sold_price)}
      </div>
    ),
  },
  {
    accessorKey: "days_on_market",
    header: () => (
      <div className="hidden xl:block text-right pr-4 text-graphite font-medium">用时(天)</div>
    ),
    cell: ({ row }) => {
      const days = row.original.days_on_market;
      return (
        <div className="hidden xl:block text-right pr-4 tabular-nums text-ink">
          {days != null ? (
            <span className="font-medium">{days}</span>
          ) : (
            <span className="text-graphite">-</span>
          )}
        </div>
      );
    },
  },
  {
    accessorKey: "manager",
    header: () => <div className="hidden xl:block text-graphite font-medium">负责人</div>,
    cell: ({ row }) => {
      const manager = row.original.project_manager;
      const displayName = manager?.nickname || manager?.username || "-";
      return (
        <div className="hidden xl:flex items-center gap-2">
          <span className="text-sm text-ink font-medium bg-fog px-2.5 py-1 rounded-full">
            {displayName}
          </span>
        </div>
      );
    },
  },
  {
    accessorKey: "net_cash_flow",
    header: () => (
      <div className="hidden lg:block text-right text-graphite font-medium">现金流</div>
    ),
    cell: ({ row }) => {
      const val = row.original.net_cash_flow || 0;
      let colorClass = "text-muted-foreground";
      if (val > 0) colorClass = "text-money-positive";
      if (val < 0) colorClass = "text-money-negative";

      return (
        <div className="hidden lg:block text-right">
          <Link
            href={`/admin/ledger/${row.original.id}`}
            onClick={(e) => e.stopPropagation()}
            className={`font-medium cursor-pointer hover:opacity-70 hover:underline decoration-2 underline-offset-4 transition-all tabular-nums ${colorClass}`}
          >
            {formatMoney(val)}
          </Link>
        </div>
      );
    },
  },
  {
    id: "actions",
    header: "操作",
    cell: ({ row, table }) => {
      const meta = table.options.meta as ProjectTableMeta | undefined;
      return <ActionCell row={row} onEdit={meta?.onEdit} />;
    },
  },
];
