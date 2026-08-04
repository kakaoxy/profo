"use client";

import type { ColumnDef } from "@tanstack/react-table";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Minus,
  Plus,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  formatAbsorptionMonths,
  formatAvgPriceWan,
  formatCount,
  formatQoq,
  formatUnitPriceYuan,
} from "../../_lib/formatters";
import type { BusinessDistrictRow } from "../../_lib/types";

export interface BusinessDistrictColumnOptions {
  sortBy: string;
  sortOrder: "asc" | "desc";
  onSortChange: (column: string) => void;
  compareIds: string[];
  onAddToCompare: (bc: string) => void;
}

const TEXT_MUTED = "text-muted-foreground font-medium";
const NUMERIC_CELL = "text-right font-mono text-sm tabular-nums";

function SortHeader({
  label,
  column,
  sortBy,
  sortOrder,
  onSortChange,
  align = "left",
}: {
  label: string;
  column: string;
  sortBy: string;
  sortOrder: "asc" | "desc";
  onSortChange: (column: string) => void;
  align?: "left" | "right";
}) {
  const active = sortBy === column;
  const Icon = !active ? ArrowUpDown : sortOrder === "asc" ? ArrowUp : ArrowDown;
  return (
    <div
      className={cn(
        "flex items-center",
        align === "right" ? "justify-end" : "justify-start",
      )}
    >
      <button
        type="button"
        onClick={() => onSortChange(column)}
        className={cn(
          "inline-flex items-center gap-1 transition-colors hover:text-foreground",
          active ? "text-foreground font-medium" : TEXT_MUTED,
        )}
      >
        <span>{label}</span>
        <Icon
          className={cn(
            "h-3 w-3",
            active ? "text-foreground" : "text-muted-foreground/60",
          )}
        />
      </button>
    </div>
  );
}

function QoqCell({ value }: { value: number | null }) {
  const { text, direction } = formatQoq(value);
  const colorClass =
    direction === "up"
      ? "text-money-positive"
      : direction === "down"
        ? "text-money-negative"
        : "text-muted-foreground";
  const Icon =
    direction === "up"
      ? TrendingUp
      : direction === "down"
        ? TrendingDown
        : Minus;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 font-mono text-sm tabular-nums",
        colorClass,
      )}
    >
      <Icon className="h-3 w-3" />
      {text}
    </span>
  );
}

function ActionCell({
  row,
  compareIds,
  onAddToCompare,
}: {
  row: BusinessDistrictRow;
  compareIds: string[];
  onAddToCompare: (bc: string) => void;
}) {
  const bc = row.business_circle;
  const isInCompare = compareIds.includes(bc);
  const isFull = compareIds.length >= 5;
  const disabled = isInCompare || isFull;
  const label = isInCompare ? "已对比" : "对比";

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!disabled) onAddToCompare(bc);
  };

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={disabled}
      onClick={handleClick}
    >
      {!isInCompare && <Plus className="h-3 w-3" />}
      {label}
    </Button>
  );
}

export function buildColumns(
  opts: BusinessDistrictColumnOptions,
): ColumnDef<BusinessDistrictRow>[] {
  const { sortBy, sortOrder, onSortChange, compareIds, onAddToCompare } = opts;
  return [
    {
      accessorKey: "business_circle",
      header: () => <span className={TEXT_MUTED}>商圈</span>,
      cell: ({ row }) => {
        const bc = row.original.business_circle;
        return (
          <span className="font-medium text-foreground">
            {bc ? bc : "未分类"}
          </span>
        );
      },
    },
    {
      accessorKey: "district",
      header: () => <span className={TEXT_MUTED}>行政区</span>,
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {row.original.district || "-"}
        </span>
      ),
    },
    {
      accessorKey: "sold_count",
      header: () => (
        <SortHeader
          label="成交套数"
          column="sold_count"
          sortBy={sortBy}
          sortOrder={sortOrder}
          onSortChange={onSortChange}
          align="right"
        />
      ),
      cell: ({ row }) => (
        <div className={NUMERIC_CELL}>
          {formatCount(row.original.sold_count)}
        </div>
      ),
    },
    {
      accessorKey: "avg_price_wan",
      header: () => (
        <SortHeader
          label="均价(万)"
          column="avg_price_wan"
          sortBy={sortBy}
          sortOrder={sortOrder}
          onSortChange={onSortChange}
          align="right"
        />
      ),
      cell: ({ row }) => (
        <div className={NUMERIC_CELL}>
          {formatAvgPriceWan(row.original.avg_price_wan)}
        </div>
      ),
    },
    {
      accessorKey: "avg_unit_price",
      header: () => (
        <SortHeader
          label="单价(元/㎡)"
          column="avg_unit_price"
          sortBy={sortBy}
          sortOrder={sortOrder}
          onSortChange={onSortChange}
          align="right"
        />
      ),
      cell: ({ row }) => (
        <div className={NUMERIC_CELL}>
          {formatUnitPriceYuan(row.original.avg_unit_price)}
        </div>
      ),
    },
    {
      accessorKey: "on_sale_count",
      header: () => (
        <SortHeader
          label="在售"
          column="on_sale_count"
          sortBy={sortBy}
          sortOrder={sortOrder}
          onSortChange={onSortChange}
          align="right"
        />
      ),
      cell: ({ row }) => (
        <div className={NUMERIC_CELL}>
          {formatCount(row.original.on_sale_count)}
        </div>
      ),
    },
    {
      accessorKey: "absorption_months",
      header: () => (
        <SortHeader
          label="去化(月)"
          column="absorption_months"
          sortBy={sortBy}
          sortOrder={sortOrder}
          onSortChange={onSortChange}
          align="right"
        />
      ),
      cell: ({ row }) => (
        <div className={NUMERIC_CELL}>
          {formatAbsorptionMonths(row.original.absorption_months)}
        </div>
      ),
    },
    {
      accessorKey: "price_qoq",
      header: () => (
        <SortHeader
          label="价环比"
          column="price_qoq"
          sortBy={sortBy}
          sortOrder={sortOrder}
          onSortChange={onSortChange}
          align="right"
        />
      ),
      cell: ({ row }) => (
        <div className="text-right">
          <QoqCell value={row.original.price_qoq} />
        </div>
      ),
    },
    {
      accessorKey: "volume_qoq",
      header: () => (
        <SortHeader
          label="量环比"
          column="volume_qoq"
          sortBy={sortBy}
          sortOrder={sortOrder}
          onSortChange={onSortChange}
          align="right"
        />
      ),
      cell: ({ row }) => (
        <div className="text-right">
          <QoqCell value={row.original.volume_qoq} />
        </div>
      ),
    },
    {
      id: "actions",
      header: () => (
        <div className="text-center">
          <span className={TEXT_MUTED}>操作</span>
        </div>
      ),
      cell: ({ row }) => (
        <div className="flex justify-center">
          <ActionCell
            row={row.original}
            compareIds={compareIds}
            onAddToCompare={onAddToCompare}
          />
        </div>
      ),
    },
  ];
}
