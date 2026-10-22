"use client";

import { CircleAlert, Paperclip, Trash2, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import { safeFormatDate, formatCNY } from "@/lib/formatters";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import { ReceiptCell } from "@/components/finance/receipt-cell";
import type { components } from "@/lib/api-types";
import { toNumber } from "@/lib/number-utils";
import { LayerPill } from "./layer-pill";

type CashFlowRecordResponse = components["schemas"]["CashFlowRecordResponse"];

interface LedgerDetailTableRowProps {
  record: CashFlowRecordResponse;
  isSettled: boolean;
  onDelete: (record: CashFlowRecordResponse) => void;
  onSupplementVoucher: (record: CashFlowRecordResponse) => void;
}

export function LedgerDetailTableRow({
  record,
  isSettled,
  onDelete,
  onSupplementVoucher,
}: LedgerDetailTableRowProps) {
  const outflow = toNumber(record.outflow) ?? 0;
  const inflow = toNumber(record.inflow) ?? 0;
  const subject = record.subject;
  const summary = record.description || record.remark || "-";

  return (
    <TableRow key={record.id} className="group text-xs hover:bg-fog">
      {/* 日期 */}
      <TableCell className="px-4 py-3">
        <span className="font-medium text-foreground tabular-nums">
          {record.date ? safeFormatDate(record.date, "yyyy-MM-dd") : "-"}
        </span>
      </TableCell>
      {/* 科目分类（名称 + LayerPill） */}
      <TableCell className="px-4 py-3">
        {subject ? (
          <div className="flex flex-col gap-1">
            <span className="font-medium text-foreground truncate text-xs" title={subject.name}>
              {subject.name}
            </span>
            <LayerPill level={subject.level} />
          </div>
        ) : (
          <span className="text-graphite">-</span>
        )}
      </TableCell>
      {/* 付款方 */}
      <TableCell className="px-4 py-3">
        <span className="text-graphite truncate block" title={record.payer ?? ""}>
          {record.payer || "-"}
        </span>
      </TableCell>
      {/* 收款方 */}
      <TableCell className="px-4 py-3">
        <span className="text-graphite truncate block" title={record.payee ?? ""}>
          {record.payee || "-"}
        </span>
      </TableCell>
      {/* 资金账户（新）：NULL = 显式「没走账户」 */}
      <TableCell className="px-4 py-3">
        {record.account_id ? (
          <span className="flex items-center gap-1.5">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-fog text-graphite ring-1 ring-dove/25">
              <Wallet className="h-3 w-3" aria-hidden="true" />
            </span>
            <span className="truncate text-[12.5px] text-ink" title={record.account_name ?? ""}>
              {record.account_name || "—"}
            </span>
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-md bg-apricot-wash/70 px-1.5 py-0.5 text-[11px] text-rust">
            <CircleAlert className="h-2.5 w-2.5" aria-hidden="true" />
            没走账户
          </span>
        )}
      </TableCell>
      {/* 流出（绿色，中国习惯） */}
      <TableCell className="px-4 py-3 text-right">
        {outflow > 0 ? (
          <span className="font-mono font-medium text-sm tabular-nums text-money-negative">
            −{formatCNY(outflow)}
          </span>
        ) : (
          <span className="text-graphite">—</span>
        )}
      </TableCell>
      {/* 流入（红色，中国习惯） */}
      <TableCell className="px-4 py-3 text-right">
        {inflow > 0 ? (
          <span className="font-mono font-medium text-sm tabular-nums text-money-positive">
            +{formatCNY(inflow)}
          </span>
        ) : (
          <span className="text-graphite">—</span>
        )}
      </TableCell>
      {/* 凭证：与账户流水页（admin/accounts/flows）同一 ReceiptCell——
          有凭证缩略图可预览、缺凭证标签可点击补传、已有凭证可继续追加 */}
      <TableCell className="px-4 py-3 text-center">
        <ReceiptCell
          urls={record.receipt_urls ?? []}
          onSupplement={isSettled ? undefined : () => onSupplementVoucher(record)}
          className="justify-center"
        />
      </TableCell>
      {/* 摘要（移至凭证和操作之间） */}
      <TableCell className="px-4 py-3">
        <span className="text-foreground truncate block" title={summary}>
          {summary}
        </span>
      </TableCell>
      {/* 操作 */}
      <TableCell className="px-4 py-3 text-center">
        <div className="flex items-center justify-center gap-0.5">
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "h-7 w-7 p-0 text-graphite hover:bg-fog hover:text-ink transition-opacity",
              isSettled
                ? "opacity-0 pointer-events-none"
                : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
            )}
            onClick={() => onSupplementVoucher(record)}
            disabled={isSettled}
            aria-label="补充凭证"
            title="补充凭证"
          >
            <Paperclip className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "h-7 w-7 p-0 text-graphite hover:text-destructive transition-opacity",
              isSettled
                ? "opacity-0 pointer-events-none"
                : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
            )}
            onClick={() => onDelete(record)}
            disabled={isSettled}
            aria-label="删除记录"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
